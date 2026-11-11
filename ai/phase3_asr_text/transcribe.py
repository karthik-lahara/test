"""
PHASE 3 orchestrator - speech to text for every diarized segment.

Flow:
    Phase 2 segments (+ clip wavs) -> language detection (Whisper, ur -> hi)
    -> route: English -> Parakeet (async subprocess) | Indic -> IndicConformer (process pool)
    -> per-segment text, in the original segment order -> phase3_result.json + data/transcripts/<call_id>.json

    python -m phase3_asr_text.transcribe --call-id CALL001
"""

import argparse
import asyncio
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from common.audio_utils import read_wav, write_wav
from common.config_loader import load_config
from common.exceptions import ASRError, ErrorCode, PipelineError
from common.logger import get_logger
from phase3_asr_text.indic_asr import _worker_transcribe, get_indic_pool
from phase3_asr_text.language_detector import detect_language, normalize_language, select_model
from phase3_asr_text.parakeet_asr import transcribe_with_parakeet

PHASE_NAME = "phase3_asr_text"


def _ensure_clips(segments: List[Dict[str, Any]], audio, sr: int, out_dir: str) -> None:
    """Phase 2 normally writes clip_path; create clips here if it didn't."""
    for s in segments:
        if s.get("clip_path") and os.path.isfile(s["clip_path"]):
            continue
        path = os.path.join(out_dir, f"seg_{s['segment_id']:04d}_{s['speaker']}.wav")
        write_wav(path, audio[int(s["start"] * sr):int(s["end"] * sr)], sr)
        s["clip_path"] = path


def _row(seg: Dict[str, Any], text: str, status: str, seconds: float) -> Dict[str, Any]:
    return {
        "segment_id": seg["segment_id"],
        "speaker": seg["speaker"],
        "start": seg["start"],
        "end": seg["end"],
        "text": text,
        "status": status,              # success | empty | error | skipped
        "processing_seconds": round(seconds, 3),
    }


async def _transcribe_indic(segments, lang, cfg, log) -> List[Dict[str, Any]]:
    loop = asyncio.get_running_loop()
    pool = get_indic_pool(cfg)
    total = len(segments)

    async def one(index: int, seg: Dict[str, Any]) -> Dict[str, Any]:
        t0 = time.perf_counter()
        try:
            text = await loop.run_in_executor(pool, _worker_transcribe, seg["clip_path"], lang)
            status = "success" if text else "empty"
        except Exception as e:
            text, status = "", "error"
            log.warning(f"Segment {seg['segment_id']} failed: {type(e).__name__}: {e}")
        row = _row(seg, text, status, time.perf_counter() - t0)
        log.info(f"[{index}/{total}] {seg['speaker']} {seg['start']:.2f}-{seg['end']:.2f}s | {status} | "
                 f"{row['processing_seconds']}s")
        return row

    # gather keeps the input order even if tasks finish in a different order
    return await asyncio.gather(*(one(i, s) for i, s in enumerate(segments, start=1)))


async def _transcribe_parakeet(segments, cfg, call_id, log) -> List[Dict[str, Any]]:
    t0 = time.perf_counter()
    texts = await transcribe_with_parakeet([s["clip_path"] for s in segments], cfg, call_id)
    per_seg = (time.perf_counter() - t0) / max(1, len(segments))
    rows = []
    for seg, text in zip(segments, texts):
        text = str(text).strip()
        rows.append(_row(seg, text, "success" if text else "empty", per_seg))
    log.info(f"Parakeet transcribed {len(rows)} segments in {time.perf_counter() - t0:.2f}s")
    return rows


async def transcribe_async(phase2_result: Dict[str, Any], call_id: str,
                           cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = cfg or load_config()
    log = get_logger(__name__, call_id)
    p3 = cfg["phase3"]
    timings: Dict[str, float] = {}
    t_total = time.perf_counter()

    out_dir = os.path.join(cfg["paths"]["processed_dir"], call_id)
    audio_path = phase2_result.get("input", {}).get("prepared_audio_path") \
        or os.path.join(out_dir, "prepared.wav")
    segments = [dict(s) for s in phase2_result.get("segments", [])]

    if not segments:
        raise ASRError(ErrorCode.P3_001_INPUT_NOT_FOUND, "No diarization segments to transcribe")
    if not os.path.isfile(audio_path):
        raise ASRError(ErrorCode.P3_001_INPUT_NOT_FOUND, "Prepared audio not found", {"path": audio_path})

    log.info(f"===== PHASE 3 START: {len(segments)} segments =====")
    audio, sr = await asyncio.to_thread(read_wav, audio_path)
    await asyncio.to_thread(_ensure_clips, segments, audio, sr, os.path.join(out_dir, "segments"))

    # ---- language detection ----
    t0 = time.perf_counter()
    raw_lang, confidence = await asyncio.to_thread(detect_language, audio, sr, segments, cfg, call_id)
    timings["language_detection"] = round(time.perf_counter() - t0, 3)

    final_lang = normalize_language(raw_lang, cfg)
    model = select_model(final_lang, cfg)
    log.info(f"Language: detected={raw_lang} final={final_lang} -> model={model}")
    if model == "unknown":
        raise ASRError(ErrorCode.P3_003_UNSUPPORTED_LANGUAGE,
                       f"Detected language '{final_lang}' is not configured for any ASR model",
                       {"detected": raw_lang, "final": final_lang})

    # ---- skip very short segments ----
    min_sec = float(p3.get("min_segment_sec", 0.3))
    todo = [s for s in segments if s["end"] - s["start"] >= min_sec]
    todo_ids = {s["segment_id"] for s in todo}
    skipped = {s["segment_id"]: _row(s, "", "skipped", 0.0) for s in segments if s["segment_id"] not in todo_ids}

    # ---- transcription ----
    t0 = time.perf_counter()
    if model == "indic":
        try:
            rows = await _transcribe_indic(todo, final_lang, cfg, log)
        except Exception as e:  # pool / model load failure
            raise ASRError(ErrorCode.P3_004_INDIC_MODEL_FAILED, "Indic ASR failed",
                           {"error": f"{type(e).__name__}: {e}"}) from e
    else:
        rows = await _transcribe_parakeet(todo, cfg, call_id, log)
    timings["transcription"] = round(time.perf_counter() - t0, 3)

    done = {r["segment_id"]: r for r in rows}
    results = [done.get(s["segment_id"]) or skipped[s["segment_id"]] for s in segments]

    counts = {k: sum(r["status"] == k for r in results) for k in ("success", "empty", "error", "skipped")}
    if todo and counts["error"] == len(todo):
        raise ASRError(ErrorCode.P3_006_ALL_SEGMENTS_FAILED, "Every segment failed to transcribe", counts)

    transcript = "\n".join(f"{r['speaker']}: {r['text']}" for r in results if r["text"])
    timings["total"] = round(time.perf_counter() - t_total, 3)

    result = {
        "phase": PHASE_NAME,
        "status": "completed",
        "call_id": call_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "language": {"detected": raw_lang, "confidence": confidence, "final": final_lang},
        "model": model,
        "segments": results,
        "transcript": transcript,
        "counts": counts,
        "timings_sec": timings,
    }

    try:
        with open(os.path.join(out_dir, "phase3_result.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        transcripts_dir = cfg["paths"].get("transcripts_dir", out_dir)
        os.makedirs(transcripts_dir, exist_ok=True)
        with open(os.path.join(transcripts_dir, f"{call_id}.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise ASRError(ErrorCode.P3_007_SAVE_FAILED, "Could not save transcript", {"error": str(e)}) from e

    log.info(f"===== PHASE 3 DONE in {timings['total']}s | success {counts['success']}, "
             f"empty {counts['empty']}, error {counts['error']}, skipped {counts['skipped']} =====")
    return result


def run_phase3(phase2_result: Dict[str, Any], call_id: str, cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Sync wrapper for normal scripts. Inside async code (FastAPI), await transcribe_async() instead."""
    return asyncio.run(transcribe_async(phase2_result, call_id, cfg))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 3 - speech to text")
    parser.add_argument("--call-id", required=True)
    args = parser.parse_args()

    from common.logger import attach_call_log, detach_call_log, setup_logging
    from phase3_asr_text.indic_asr import shutdown_indic_pool

    cfg = load_config()
    setup_logging(cfg["paths"]["log_dir"])
    handler = attach_call_log(args.call_id)
    p2_path = os.path.join(cfg["paths"]["processed_dir"], args.call_id, "phase2_result.json")
    try:
        if not os.path.isfile(p2_path):
            raise ASRError(ErrorCode.P3_001_INPUT_NOT_FOUND, "Run Phase 2 first", {"path": p2_path})
        with open(p2_path, encoding="utf-8") as f:
            res = run_phase3(json.load(f), args.call_id, cfg)
        print(res["transcript"])
    except PipelineError as e:
        print(json.dumps({"status": "failed", **e.to_dict()}, indent=2, ensure_ascii=False))
        raise SystemExit(1)
    finally:
        shutdown_indic_pool()
        detach_call_log(handler)