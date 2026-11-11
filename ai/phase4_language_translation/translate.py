"""
PHASE 4 orchestrator - translate the Phase 3 transcript into English.

Keeps the original text and ADDS `text_english` to every segment,
plus `transcript_english` for the whole call.
If the call is already English, text is copied (no model is loaded).

    python -m phase4_language_translation.translate --call-id CALL001
"""

import argparse
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from common.config_loader import load_config
from common.exceptions import ErrorCode, PipelineError, TranslationError
from common.logger import get_logger

PHASE_NAME = "phase4_language_translation"


def run_phase4(phase3_result: Dict[str, Any], call_id: str,
               cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = cfg or load_config()
    log = get_logger(__name__, call_id)
    p4 = cfg["phase4"]
    t_total = time.perf_counter()

    segments = phase3_result.get("segments")
    if not segments:
        raise TranslationError(ErrorCode.P4_001_INPUT_NOT_FOUND, "No transcript segments to translate")

    source_lang = phase3_result.get("language", {}).get("final", "unknown")
    skip_langs = set(p4.get("skip_languages", ["en"]))
    log.info(f"===== PHASE 4 START: {len(segments)} segments, source language '{source_lang}' =====")

    out_segments = []
    counts = {"translated": 0, "copied": 0, "empty": 0, "error": 0}

    if source_lang in skip_langs:
        log.info(f"Source is '{source_lang}' -> copying text, no translation needed")
        for s in segments:
            out_segments.append({**s, "text_english": s.get("text", "")})
            counts["copied" if s.get("text") else "empty"] += 1
        model_used = None
    else:
        from phase4_language_translation.translator import Translator

        translator = Translator(cfg, call_id)
        model_used = p4["model_name"]
        total = len(segments)
        for i, s in enumerate(segments, start=1):
            text = s.get("text", "")
            if not text:
                out_segments.append({**s, "text_english": ""})
                counts["empty"] += 1
                continue
            t0 = time.perf_counter()
            try:
                english = translator.translate_text(text)
                out_segments.append({**s, "text_english": english, "translation_status": "success"})
                counts["translated"] += 1
            except Exception as e:
                if "out of memory" in str(e).lower():
                    raise TranslationError(ErrorCode.P4_004_GPU_OUT_OF_MEMORY,
                                           "GPU ran out of memory during translation") from e
                log.warning(f"Segment {s.get('segment_id')} translation failed: {type(e).__name__}: {e}")
                out_segments.append({**s, "text_english": "", "translation_status": "error"})
                counts["error"] += 1
            log.info(f"[{i}/{total}] {s.get('speaker')} translated in {time.perf_counter() - t0:.1f}s")

        if counts["translated"] == 0 and counts["error"] > 0:
            raise TranslationError(ErrorCode.P4_003_TRANSLATION_FAILED, "Every segment failed to translate", counts)

    transcript_english = "\n".join(
        f"{s['speaker']}: {s['text_english']}" for s in out_segments if s.get("text_english"))

    result = {
        "phase": PHASE_NAME,
        "status": "completed",
        "call_id": call_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "source_language": source_lang,
        "target_language": p4.get("target_language", "English"),
        "model": model_used,
        "segments": out_segments,
        "transcript_original": phase3_result.get("transcript", ""),
        "transcript_english": transcript_english,
        "counts": counts,
        "timings_sec": {"total": round(time.perf_counter() - t_total, 3)},
    }

    out_dir = os.path.join(cfg["paths"]["processed_dir"], call_id)
    try:
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "phase4_result.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        transcripts_dir = cfg["paths"].get("transcripts_dir", out_dir)
        os.makedirs(transcripts_dir, exist_ok=True)
        with open(os.path.join(transcripts_dir, f"{call_id}_english.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise TranslationError(ErrorCode.P4_005_SAVE_FAILED, "Could not save translation", {"error": str(e)}) from e

    log.info(f"===== PHASE 4 DONE in {result['timings_sec']['total']}s | {counts} =====")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 4 - translation")
    parser.add_argument("--call-id", required=True)
    args = parser.parse_args()

    from common.logger import attach_call_log, detach_call_log, setup_logging

    cfg = load_config()
    setup_logging(cfg["paths"]["log_dir"])
    handler = attach_call_log(args.call_id)
    p3_path = os.path.join(cfg["paths"]["processed_dir"], args.call_id, "phase3_result.json")
    try:
        if not os.path.isfile(p3_path):
            raise TranslationError(ErrorCode.P4_001_INPUT_NOT_FOUND, "Run Phase 3 first", {"path": p3_path})
        with open(p3_path, encoding="utf-8") as f:
            res = run_phase4(json.load(f), args.call_id, cfg)
        print(res["transcript_english"])
    except PipelineError as e:
        print(json.dumps({"status": "failed", **e.to_dict()}, indent=2, ensure_ascii=False))
        raise SystemExit(1)
    finally:
        detach_call_log(handler)