"""
PHASE 7 orchestrator - overall conversation analysis (text + voice) -> FINAL call report.

TEXT (local Ollama, gemma3:12b - the newer conversation-analysis script):
    1. Roles           (manual map -> Phase 4b -> gemma role step -> summary fallback)
    2. Summary         (+ follow_up + entities + customer interest)
    3. Behaviour       (agent, customer, overall) with fixed severity weightage
    4. Tone check      (every agent line on its own + English translation; severity override)
    5. Text flags      (verified quotes + tone-check lines, highest severity first)
VOICE (from Phase 6, no model here):
    6. Fusion          (voice units aligned to each line, voice flags merged, text+voice = corroborated)
    7. Assessment      (per role and for the whole call)

Output:
    data/processed/<call_id>/phase7_result.json        detailed
    data/processed/<call_id>/phase7_final_report.json  compact -> MERN callback
    data/results/<call_id>_final_report.json            same compact report

    python -m phase7_overall_conversation_analysis.analyze_overall_conversation --call-id CALL001
"""

import argparse
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from common.config_loader import load_config
from common.exceptions import ErrorCode, OverallAnalysisError, PipelineError
from common.logger import get_logger
from phase5_text_behaviour_analysis.analyze_text_behaviour import language_of
from phase5_text_behaviour_analysis.ollama_client import OllamaClient, OllamaUnavailableError
from phase5_text_behaviour_analysis.role_detection import (apply_roles, detect_roles, roles_from_phase4b,
                                                           run_role_step)
from phase5_text_behaviour_analysis.transcript_utils import load_segments
from phase7_overall_conversation_analysis.behaviour_analyzer import run_overall_behaviour, run_role_behaviour
from phase7_overall_conversation_analysis.final_report import build_final_report
from phase7_overall_conversation_analysis.review_flags import build_text_flags, merge_tone_flags
from phase7_overall_conversation_analysis.segment_tone import apply_segment_tone, run_segment_tone
from phase7_overall_conversation_analysis.summarizer import run_summary
from phase7_overall_conversation_analysis.voice_fusion import (align_segments, call_assessment, merge_voice_flags,
                                                               role_assessment)

PHASE_NAME = "phase7_overall_conversation_analysis"


def _llm_cfg(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """The Phase 5 helpers read cfg["phase5"]; give them Phase 5 settings overridden by Phase 7 ones."""
    merged = {**cfg.get("phase5", {}), **{k: v for k, v in cfg["phase7"].items() if v is not None}}
    if cfg["phase7"].get("ollama") is None:
        merged["ollama"] = cfg.get("phase5", {}).get("ollama", {})
    return {**cfg, "phase5": merged}


def run_phase7(previous_result: Dict[str, Any], call_id: str, cfg: Optional[Dict[str, Any]] = None,
               language: Optional[str] = None, voice_result: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    previous_result: Phase 4b result (preferred) or Phase 4 / Phase 3 result.
    voice_result:    Phase 6 result (None -> text-only report, voice fields empty).
    """
    cfg = cfg or load_config()
    log = get_logger(__name__, call_id)
    p7 = cfg["phase7"]
    lcfg = _llm_cfg(cfg)
    t_start = time.monotonic()
    errors = []

    segments = load_segments(previous_result, p7.get("text_field", "text"))
    language = language or language_of(previous_result)
    speakers = sorted({s["speaker"] for s in segments})
    client = OllamaClient(lcfg, log)
    log.info(f"===== PHASE 7 START: {len(segments)} segments, language '{language}', model {client.model}, "
             f"voice {'yes' if voice_result else 'no'} =====")

    try:
        # ---- 1. roles ----
        manual = p7.get("speaker_role_map") or {}
        p4b_roles = roles_from_phase4b(previous_result, speakers)
        preset = ("phase4b_speaker_roles", p4b_roles) if p4b_roles else None
        role_step = None
        if not (manual and all(sp in manual for sp in speakers)) and not preset:
            role_step = run_role_step(client, segments, language, lcfg, log)
        role_map, role_info = detect_roles(segments, [("role_step", role_step)], manual, preset)
        apply_roles(segments, role_map)
        log.info(f"Roles: {role_map} ({role_info['source']}, {role_info['confidence']})")

        # ---- 2. summary ----
        summary = None
        try:
            summary = run_summary(client, segments, language, role_map, cfg, log)
        except OllamaUnavailableError:
            raise
        except Exception as e:
            log.warning(f"Summary failed: {e}")
            errors.append({"stage": "summary", "error": str(e)})
        if role_info["source"] == "failed" and summary:
            role_map, role_info = detect_roles(segments, [("summary", summary)])
            apply_roles(segments, role_map)

        # ---- 3. behaviour ----
        agent_result = run_role_behaviour(client, segments, "agent", errors, cfg, log)
        customer_result = run_role_behaviour(client, segments, "customer", errors, cfg, log)
        overall_result = run_overall_behaviour(client, segments, errors, cfg, log)

        # ---- 4. line-by-line tone check ----
        tone_by_role = {r: run_segment_tone(client, segments, r, language, errors, cfg, log)
                        for r in p7.get("segment_tone_roles", ["agent"])}
    except OllamaUnavailableError as e:
        raise OverallAnalysisError(ErrorCode.P7_002_OLLAMA_UNAVAILABLE, str(e),
                                   {"url": client.url, "model": client.model}) from e

    if summary is None and all("error" in r for r in (agent_result, customer_result, overall_result)):
        raise OverallAnalysisError(ErrorCode.P7_003_ANALYSIS_FAILED, "Summary and all behaviour analyses failed",
                                   {"errors": errors})

    all_tone = [t for items in tone_by_role.values() for t in items]

    # ---- 5. text review flags + severity override ----
    flags = build_text_flags(segments, agent_result, customer_result, overall_result,
                             min_severity=int(p7.get("human_review_min_severity", 1)))
    flags = merge_tone_flags(flags, all_tone, int(p7.get("unclear_min_chars", 40)))
    agent_result = apply_segment_tone(agent_result, tone_by_role.get("agent", []))
    customer_result = apply_segment_tone(customer_result, tone_by_role.get("customer", []))
    overall_result = apply_segment_tone(overall_result, all_tone)
    for role, items in tone_by_role.items():
        target = agent_result if role == "agent" else customer_result if role == "customer" else None
        if isinstance(target, dict):
            target["segment_tone"] = items

    # ---- 6. voice fusion ----
    voice_timeline = (voice_result or {}).get("segment_emotion_predictions") or []
    aligned = align_segments(segments, voice_timeline, all_tone, flags,
                             float(p7["fusion"].get("voice_flag_min_score", 0.35)))
    if voice_result:
        flags = merge_voice_flags(flags, aligned, cfg)
    else:
        log.warning("No Phase 6 voice result - final report is text only")

    # ---- 7. assessments ----
    agent_combined = role_assessment("agent", agent_result, (voice_result or {}).get("agent"), cfg)
    customer_combined = role_assessment("customer", customer_result, (voice_result or {}).get("customer"), cfg)
    combined = {"agent": agent_combined, "customer": customer_combined,
                "call_assessment": call_assessment(agent_combined, customer_combined)}

    for f in flags[:10]:
        log.warning(f"REVIEW #{f['review_priority']} {f['timestamp']} {f['speaker']} ({f['role']}): "
                    f"{f['priority_behaviour']} [{'+'.join(f['evidence_sources'])}]")

    timing = client.timing_summary(time.monotonic() - t_start)
    if voice_result:
        timing["voice_phase6_seconds"] = (voice_result.get("execution", {}).get("timing", {})
                                          .get("phase_total_sec"))
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
        "summary": summary,
        "overall_conversation_behaviour": overall_result,
        "customer_behaviour": customer_result,
        "agent_behaviour": agent_result,
        "voice": ({"call_level_result": voice_result.get("call_level_result"),
                   "call_duration_sec": voice_result.get("call_duration_sec"),
                   "roles": voice_result.get("roles")} if voice_result else None),
        "combined": combined,
        "segments_text_and_voice": aligned,
        "human_review": {"review_required": bool(flags), "flagged_segment_count": len(flags),
                         "flagged_segments": flags},
        "timing": timing,
        "errors": errors,
    }
    final_report = build_final_report(output)
    output["final_report"] = final_report

    out_dir = os.path.join(cfg["paths"]["processed_dir"], call_id)
    try:
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "phase7_result.json"), "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        with open(os.path.join(out_dir, "phase7_final_report.json"), "w", encoding="utf-8") as f:
            json.dump(final_report, f, indent=2, ensure_ascii=False)
        with open(os.path.join(cfg["paths"]["results_dir"], f"{call_id}_final_report.json"), "w",
                  encoding="utf-8") as f:
            json.dump(final_report, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise OverallAnalysisError(ErrorCode.P7_004_SAVE_FAILED, "Could not save Phase 7 output",
                                   {"error": str(e)}) from e

    log.info(f"===== PHASE 7 DONE in {timing['total_pipeline_seconds']}s | call {combined['call_assessment']} | "
             f"{len(flags)} review flags ({final_report['human_review']['corroborated_count']} text+voice) | "
             f"{timing['ollama_call_count']} Ollama calls | {len(errors)} errors =====")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 7 - overall conversation analysis (text + voice)")
    parser.add_argument("--call-id", required=True)
    args = parser.parse_args()

    from common.logger import attach_call_log, detach_call_log, setup_logging

    cfg = load_config()
    setup_logging(cfg["paths"]["log_dir"])
    handler = attach_call_log(args.call_id)
    call_dir = os.path.join(cfg["paths"]["processed_dir"], args.call_id)

    def _load(name):
        path = os.path.join(call_dir, name)
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as fh:
                return json.load(fh)
        return None

    try:
        previous = _load("phase4b_result.json") or _load("phase4_result.json") or _load("phase3_result.json")
        if previous is None:
            raise OverallAnalysisError(ErrorCode.P7_001_INPUT_NOT_FOUND, "Run Phases 3-4b first", {"dir": call_dir})
        lang = language_of(previous)
        if lang == "unknown":
            lang = language_of(_load("phase4_result.json") or _load("phase3_result.json") or {})
        res = run_phase7(previous, args.call_id, cfg, language=lang, voice_result=_load("phase6_result.json"))
        print(json.dumps(res["final_report"], indent=2, ensure_ascii=False))
    except PipelineError as e:
        print(json.dumps({"status": "failed", **e.to_dict()}, indent=2, ensure_ascii=False))
        raise SystemExit(1)
    finally:
        detach_call_log(handler)