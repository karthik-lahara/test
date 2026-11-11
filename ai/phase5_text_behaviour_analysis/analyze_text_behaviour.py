"""
PHASE 5 orchestrator - text behaviour analysis with a local Ollama model (gemma3:12b).

    1. Roles          (manual map -> Phase 4b -> gemma role step -> summary fallback)
    2. Summary        (+ entities + customer interest)
    3. Behaviour      (agent, customer, overall)
    4. Human review   (timestamp flags from verified negative evidence)
    5. Timing         (model load / prompt / generation per stage)

Output in data/processed/<call_id>/:
    phase5_result.json    detailed (evidence quotes, reasons, per-call timing)
    phase5_compact.json   compact (for the dashboard / MERN callback)

Ollama must be running:  ollama serve   +   ollama pull gemma3:12b

    python -m phase5_text_behaviour_analysis.analyze_text_behaviour --call-id CALL001
"""

import argparse
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from common.config_loader import load_config
from common.exceptions import ErrorCode, PipelineError, TextBehaviourError
from common.logger import get_logger
from phase5_text_behaviour_analysis.behaviour_analyzer import run_overall_behaviour, run_role_behaviour
from phase5_text_behaviour_analysis.ollama_client import OllamaClient, OllamaUnavailableError
from phase5_text_behaviour_analysis.review_flags import build_human_review_flags
from phase5_text_behaviour_analysis.role_detection import (apply_roles, detect_roles, roles_from_phase4b,
                                                           run_role_step)
from phase5_text_behaviour_analysis.summarizer import run_summary
from phase5_text_behaviour_analysis.transcript_utils import load_segments

PHASE_NAME = "phase5_text_behaviour_analysis"


def language_of(result: Dict[str, Any]) -> str:
    """Language code from a Phase 3 / 4 / 4b result."""
    if result.get("source_language"):
        return result["source_language"]
    lang = result.get("language")
    if isinstance(lang, dict):
        return lang.get("final") or lang.get("detected") or "unknown"
    return lang if isinstance(lang, str) and lang else "unknown"


def _compact_behaviour(result: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not result:
        return None
    return {
        "primary_behaviour": result.get("primary_behaviour", "neutral"),
        "overall_behaviour": result.get("overall_behaviour", "NEUTRAL"),
        "behaviour_labels": [b["label"] for b in result.get("behaviours", [])],
        "mixed_signals": result.get("mixed_signals", False),
        "reason": result.get("reason", ""),
    }


def build_compact_output(output: Dict[str, Any]) -> Dict[str, Any]:
    summary = output.get("summary")
    if summary:
        summary = {k: v for k, v in summary.items() if k not in {"language", "agent_speaker", "client_speaker"}}
    mapping = output["roles"]["mapping"]
    timing = output.get("timing") or {}
    return {
        "call_id": output["call_id"],
        "language": output["language"],
        "model": output["model"],
        "generated_at": output["completed_at"],
        "roles": {
            "agent_speaker": next((sp for sp, r in mapping.items() if r == "agent"), None),
            "customer_speakers": [sp for sp, r in mapping.items() if r == "customer"],
            "confidence": output["roles"]["confidence"],
        },
        "summary": summary,
        "agent_behaviour": _compact_behaviour(output.get("agent_behaviour")),
        "customer_behaviour": _compact_behaviour(output.get("customer_behaviour")),
        "overall_conversation_behaviour": _compact_behaviour(output.get("overall_conversation_behaviour")),
        "human_review": output.get("human_review", {}),
        "timing": {k: v for k, v in timing.items() if k != "calls"},
        "errors": output.get("errors", []),
    }


def run_phase5(previous_result: Dict[str, Any], call_id: str, cfg: Optional[Dict[str, Any]] = None,
               language: Optional[str] = None) -> Dict[str, Any]:
    """
    previous_result: Phase 4b result (preferred), or Phase 4 / Phase 3 result.
    language: transcript language code; taken from the result if not given.
    """
    cfg = cfg or load_config()
    log = get_logger(__name__, call_id)
    p5 = cfg["phase5"]
    t_start = time.monotonic()
    errors = []

    segments = load_segments(previous_result, p5.get("text_field", "text"))
    language = language or language_of(previous_result)
    speakers = sorted({s["speaker"] for s in segments})
    client = OllamaClient(cfg, log)
    log.info(f"===== PHASE 5 START: {len(segments)} segments, {len(speakers)} speakers, "
             f"language '{language}', model {client.model} =====")

    try:
        # ---- 1. roles ----
        manual = p5.get("speaker_role_map") or {}
        preset = None
        p4b_roles = roles_from_phase4b(previous_result, speakers)
        if p4b_roles:
            preset = ("phase4b_speaker_roles", p4b_roles)

        role_step = None
        manual_covers_all = bool(manual) and all(sp in manual for sp in speakers)
        if not manual_covers_all and not preset:
            role_step = run_role_step(client, segments, language, cfg, log)

        role_map, role_info = detect_roles(segments, [("role_step", role_step)], manual, preset)
        apply_roles(segments, role_map)
        log.info(f"Roles: {role_map} (source {role_info['source']}, confidence {role_info['confidence']})")

        # ---- 2. summary ----
        summary_result = None
        try:
            summary_result = run_summary(client, segments, language, role_map, cfg, log)
        except OllamaUnavailableError:
            raise
        except Exception as e:
            log.warning(f"Summary failed: {e}")
            errors.append({"stage": "summary", "error": str(e)})

        if role_info["source"] == "failed" and summary_result:
            role_map, role_info = detect_roles(segments, [("summary", summary_result)])
            apply_roles(segments, role_map)
            log.info(f"Roles taken from the summary: {role_map} ({role_info['confidence']})")

        # ---- 3. behaviour ----
        agent_result = run_role_behaviour(client, segments, "agent", errors, cfg, log)
        customer_result = run_role_behaviour(client, segments, "customer", errors, cfg, log)
        overall_result = run_overall_behaviour(client, segments, errors, cfg, log)

    except OllamaUnavailableError as e:
        raise TextBehaviourError(ErrorCode.P5_002_OLLAMA_UNAVAILABLE, str(e),
                                 {"url": client.url, "model": client.model}) from e

    if summary_result is None and all("error" in r for r in (agent_result, customer_result, overall_result)):
        raise TextBehaviourError(ErrorCode.P5_003_ANALYSIS_FAILED, "Summary and all behaviour analyses failed",
                                 {"errors": errors})

    # ---- 4. human review ----
    flags = build_human_review_flags(segments, agent_result, customer_result, overall_result)
    for f in flags:
        log.warning(f"REVIEW [{f['start']:.2f}-{f['end']:.2f}s] {f['speaker']} ({f['role']}): "
                    f"{', '.join(f['behaviours'])}")

    # ---- 5. timing + save ----
    timing = client.timing_summary(time.monotonic() - t_start)
    output = {
        "phase": PHASE_NAME,
        "status": "completed",
        "call_id": call_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "language": language,
        "model": client.model,
        "segment_count": len(segments),
        "speaker_count": len(speakers),
        "roles": {"mapping": role_map, **role_info},
        "summary": summary_result,
        "overall_conversation_behaviour": overall_result,
        "customer_behaviour": customer_result,
        "agent_behaviour": agent_result,
        "human_review": {"review_required": bool(flags), "flagged_segment_count": len(flags),
                         "flagged_segments": flags},
        "timing": timing,
        "errors": errors,
    }
    compact = build_compact_output(output)
    output["compact"] = compact

    out_dir = os.path.join(cfg["paths"]["processed_dir"], call_id)
    try:
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "phase5_result.json"), "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        with open(os.path.join(out_dir, "phase5_compact.json"), "w", encoding="utf-8") as f:
            json.dump(compact, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise TextBehaviourError(ErrorCode.P5_004_SAVE_FAILED, "Could not save Phase 5 output",
                                 {"error": str(e)}) from e

    log.info(f"===== PHASE 5 DONE in {timing['total_pipeline_seconds']}s | {timing['ollama_call_count']} "
             f"Ollama calls | {len(flags)} review flags | {len(errors)} errors =====")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 5 - text behaviour analysis")
    parser.add_argument("--call-id", required=True)
    args = parser.parse_args()

    from common.logger import attach_call_log, detach_call_log, setup_logging

    cfg = load_config()
    setup_logging(cfg["paths"]["log_dir"])
    handler = attach_call_log(args.call_id)
    call_dir = os.path.join(cfg["paths"]["processed_dir"], args.call_id)
    try:
        # newest available input: 4b -> 4 -> 3
        for name in ("phase4b_result.json", "phase4_result.json", "phase3_result.json"):
            path = os.path.join(call_dir, name)
            if os.path.isfile(path):
                break
        else:
            raise TextBehaviourError(ErrorCode.P5_001_INPUT_NOT_FOUND, "Run Phase 3/4/4b first", {"dir": call_dir})
        with open(path, encoding="utf-8") as f:
            previous = json.load(f)
        lang = language_of(previous)
        p4_path = os.path.join(call_dir, "phase4_result.json")
        if lang == "unknown" and os.path.isfile(p4_path):     # Phase 4b output has no language field
            with open(p4_path, encoding="utf-8") as f:
                lang = language_of(json.load(f))
        res = run_phase5(previous, args.call_id, cfg, language=lang)
        print(json.dumps(res["compact"], indent=2, ensure_ascii=False))
    except PipelineError as e:
        print(json.dumps({"status": "failed", **e.to_dict()}, indent=2, ensure_ascii=False))
        raise SystemExit(1)
    finally:
        detach_call_log(handler)