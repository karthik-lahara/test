"""
PHASE 6 orchestrator - voice behaviour analysis (audio only, no LLM).

    1. Roles        (config override -> Phase 4b segment roles -> Phase 5 mapping -> first speaker = agent)
    2. Units        (agent / customer turns split into <= 4 s pieces)
    3. Pauses       (Silero VAD over the whole call)
    4. Per unit     (Emotion2Vec + pitch/energy, async in parallel)
    5. Baselines    (each speaker vs. their own first 3 units)
    6. Report       (timeline, per-role emotion runs + changes, anger/frustration timestamps)

Input : data/processed/<call_id>/prepared.wav  +  Phase 4b (or Phase 2) segments
Output: data/processed/<call_id>/phase6_result.json

    python -m phase6_voice_behaviour_analysis.analyze_voice_behaviour --call-id CALL001
"""

import argparse
import asyncio
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from common.audio_utils import read_wav
from common.config_loader import load_config
from common.exceptions import ErrorCode, PipelineError, VoiceBehaviourError
from common.logger import get_logger
from phase6_voice_behaviour_analysis.audio_features import detect_pauses
from phase6_voice_behaviour_analysis.model_loader import load_models
from phase6_voice_behaviour_analysis.parallel_runner import analyse_all
from phase6_voice_behaviour_analysis.report import INTERPRETATION_NOTES, build_role_report, build_timeline
from phase6_voice_behaviour_analysis.role_resolver import resolve_roles
from phase6_voice_behaviour_analysis.row_builder import apply_speaker_baselines, assemble_rows
from phase6_voice_behaviour_analysis.units import load_segments, make_units

PHASE_NAME = "phase6_voice_behaviour_analysis"


async def run_phase6_async(prepared_audio_path: str, previous_result: Dict[str, Any], call_id: str,
                           cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    previous_result: Phase 4b result (segments with roles) - or Phase 2 result.
                     A Phase 5 role mapping can be passed in previous_result["roles"].
    """
    cfg = cfg or load_config()
    log = get_logger(__name__, call_id)
    p6 = cfg["phase6"]
    t_start = time.perf_counter()

    if not os.path.isfile(prepared_audio_path):
        raise VoiceBehaviourError(ErrorCode.P6_001_INPUT_NOT_FOUND, "Prepared audio not found",
                                  {"path": prepared_audio_path})
    segs = load_segments(previous_result)
    if not segs:
        raise VoiceBehaviourError(ErrorCode.P6_001_INPUT_NOT_FOUND, "No speaker segments found")

    audio, sr = await asyncio.to_thread(read_wav, prepared_audio_path)
    if sr != int(p6.get("sample_rate", 16000)):
        from phase1_audio_preparation.resampler import resample
        audio = resample(audio, sr, int(p6["sample_rate"]))
        sr = int(p6["sample_rate"])
    duration = len(audio) / sr
    speakers = sorted({s["speaker"] for s in segs})
    log.info(f"===== PHASE 6 START: {duration:.1f}s audio, {len(segs)} segments, speakers {speakers} =====")

    # ---- 1. roles ----
    mapping, source, confidence = resolve_roles(previous_result, segs, speakers, p6.get("role_mapping_override"))
    if confidence == "low":
        log.warning("No reliable roles found - assuming the first speaker is the AGENT. "
                    "Set phase6.role_mapping_override in config.yaml if that is wrong.")
    log.info(f"Roles: {mapping} (source {source}, confidence {confidence})")

    # ---- 2. models + units + pauses ----
    emotion_model, vad_model, load_seconds = await asyncio.to_thread(load_models, cfg, call_id)
    units = make_units(segs, mapping, duration, float(p6.get("min_unit_sec", 0.5)),
                       float(p6.get("max_unit_sec", 4.0)))
    if not units:
        raise VoiceBehaviourError(ErrorCode.P6_003_NO_USABLE_UNITS,
                                  "No agent/customer speech long enough to analyse",
                                  {"min_unit_sec": p6.get("min_unit_sec", 0.5)})
    pauses = await asyncio.to_thread(detect_pauses, audio, sr, vad_model, p6.get("vad", {}))
    log.info(f"{len(units)} units | {len(pauses)} pauses >= {p6.get('vad', {}).get('min_pause_sec', 0.3)}s")

    # ---- 3. parallel emotion + pitch/energy ----
    results, timing = await analyse_all(units, audio, sr, emotion_model, cfg, log)
    timing["model_load_time_sec"] = round(load_seconds, 3)

    # ---- 4. rows + baselines ----
    rows, errors = assemble_rows(units, results, pauses)
    for e in errors:
        log.warning(e)
    if not rows:
        raise VoiceBehaviourError(ErrorCode.P6_003_NO_USABLE_UNITS, "No usable units")
    baselines = apply_speaker_baselines(rows, cfg, log)

    # ---- 5. report ----
    timeline = build_timeline(rows, cfg)
    merge_gap = float(p6["report"].get("run_merge_gap_sec", 0.5))
    customer_report = build_role_report(timeline, "customer", merge_gap)
    agent_report = build_role_report(timeline, "agent", merge_gap)
    all_flags = [x for x in timeline if x["voice_behaviour"] in {"angry", "frustrated"}]
    call_status = ("anger_or_frustration_detected_review_timestamps" if all_flags
                   else "no_clear_anger_or_frustration_detected")
    timing["phase_total_sec"] = round(time.perf_counter() - t_start, 3)

    result = {
        "phase": PHASE_NAME,
        "status": "completed",
        "call_id": call_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "model": p6["emotion_model"],
        "call_duration_sec": round(duration, 2),
        "call_level_result": call_status,
        "roles": {"mapping": mapping, "source": source, "confidence": confidence},
        "speaker_baselines": baselines,
        "customer": customer_report,
        "agent": agent_report,
        "anger_frustration_timestamps": all_flags,
        "segment_emotion_predictions": timeline,
        "execution": {"max_emotion_window_sec": p6.get("max_unit_sec", 4.0), "timing": timing},
        "interpretation_notes": INTERPRETATION_NOTES,
        "reliability": {
            "status": "model_prediction_not_accuracy_validated",
            "validation_required": "Compare predictions with manually labelled segments from the target "
                                   "languages to calculate precision, recall, F1 and confusion matrix.",
        },
        "errors": errors,
    }

    out_dir = os.path.join(cfg["paths"]["processed_dir"], call_id)
    try:
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "phase6_result.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2,
                      default=lambda o: o.item() if hasattr(o, "item") else str(o))
    except Exception as e:
        raise VoiceBehaviourError(ErrorCode.P6_004_SAVE_FAILED, "Could not save Phase 6 output",
                                  {"error": str(e)}) from e

    log.info(f"===== PHASE 6 DONE in {timing['phase_total_sec']}s | {call_status} | "
             f"customer {customer_report['dominant_emotion']}, agent {agent_report['dominant_emotion']} | "
             f"{len(all_flags)} anger/frustration units =====")
    return result


def run_phase6(prepared_audio_path: str, previous_result: Dict[str, Any], call_id: str,
               cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Sync wrapper for normal scripts. Inside async code (FastAPI), await run_phase6_async() instead."""
    return asyncio.run(run_phase6_async(prepared_audio_path, previous_result, call_id, cfg))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 6 - voice behaviour analysis")
    parser.add_argument("--call-id", required=True)
    args = parser.parse_args()

    from common.logger import attach_call_log, detach_call_log, setup_logging
    from phase6_voice_behaviour_analysis.parallel_runner import shutdown_pools

    cfg = load_config()
    setup_logging(cfg["paths"]["log_dir"])
    handler = attach_call_log(args.call_id)
    call_dir = os.path.join(cfg["paths"]["processed_dir"], args.call_id)
    try:
        for name in ("phase4b_result.json", "phase2_result.json"):
            path = os.path.join(call_dir, name)
            if os.path.isfile(path):
                break
        else:
            raise VoiceBehaviourError(ErrorCode.P6_001_INPUT_NOT_FOUND, "Run Phase 2 (or 4b) first",
                                      {"dir": call_dir})
        with open(path, encoding="utf-8") as f:
            previous = json.load(f)
        p5_path = os.path.join(call_dir, "phase5_result.json")
        if os.path.isfile(p5_path):                       # Phase 5 roles as an extra fallback
            with open(p5_path, encoding="utf-8") as f:
                previous["roles"] = json.load(f).get("roles", {})
        res = run_phase6(os.path.join(call_dir, "prepared.wav"), previous, args.call_id, cfg)
        print(json.dumps({"call_level_result": res["call_level_result"], "roles": res["roles"],
                          "customer_dominant": res["customer"]["dominant_emotion"],
                          "agent_dominant": res["agent"]["dominant_emotion"],
                          "anger_frustration_units": len(res["anger_frustration_timestamps"]),
                          "timing": {k: v for k, v in res["execution"]["timing"].items()
                                     if k != "individual_segment_times_sec"}}, indent=2))
    except PipelineError as e:
        print(json.dumps({"status": "failed", **e.to_dict()}, indent=2, ensure_ascii=False))
        raise SystemExit(1)
    finally:
        shutdown_pools()
        detach_call_log(handler)