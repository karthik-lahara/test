"""
PHASE 4b orchestrator - label each speaker as AGENT or CUSTOMER.
 
Input : Phase 4 result (segments with text + text_english)
Output: same segments + "role" on each, a speaker_roles list, and role_status
        ok             -> one AGENT + CUSTOMER(s) found
        role_uncertain -> model was unsure / bad answer -> every speaker UNKNOWN
        single_speaker -> only one speaker in the call -> UNKNOWN
 
An uncertain result does NOT fail the pipeline; later phases just see UNKNOWN.
 
    python -m phase4b_speaker_roles.identify_roles --call-id CALL001
"""
 
import argparse
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional
 
from common.config_loader import load_config
from common.exceptions import ErrorCode, PipelineError, RoleIdentificationError
from common.logger import get_logger
from phase4b_speaker_roles.conversation_builder import build_conversation
 
PHASE_NAME = "phase4b_speaker_roles"
 
 
def run_phase4b(phase4_result: Dict[str, Any], call_id: str,
                cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = cfg or load_config()
    log = get_logger(__name__, call_id)
    pcfg = cfg["phase4b"]
    t0 = time.perf_counter()
 
    segments = phase4_result.get("segments")
    if not segments:
        raise RoleIdentificationError(ErrorCode.P4B_001_INPUT_NOT_FOUND, "No segments to classify")
 
    speaker_ids = sorted({s["speaker"] for s in segments})
    log.info(f"===== PHASE 4b START: {len(speaker_ids)} speakers {speaker_ids} =====")
 
    raw_output = ""
    if len(speaker_ids) < 2:
        roles = {s: "UNKNOWN" for s in speaker_ids}
        role_status = "single_speaker"
        log.warning("Only one speaker found - cannot tell agent from customer")
    else:
        conversation = build_conversation(
            segments,
            max_turns=int(pcfg.get("max_turns", 20)),
            max_chars=int(pcfg.get("max_chars", 3000)),
            prefer_english=bool(pcfg.get("prefer_english", True)),
        )
        if not conversation:
            raise RoleIdentificationError(ErrorCode.P4B_001_INPUT_NOT_FOUND, "All segments have empty text")
 
        from phase4b_speaker_roles.role_classifier import identify_roles
 
        try:
            roles, raw_output = identify_roles(conversation, speaker_ids, cfg, call_id)
        except RoleIdentificationError:
            raise
        except Exception as e:
            raise RoleIdentificationError(ErrorCode.P4B_003_CLASSIFICATION_FAILED, "Role classification failed",
                                          {"error": f"{type(e).__name__}: {e}"}) from e
        role_status = "ok" if "UNKNOWN" not in roles.values() else "role_uncertain"
 
    log.info(f"Roles: {roles} ({role_status})")
 
    result = {
        "phase": PHASE_NAME,
        "status": "completed",
        "call_id": call_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "model": pcfg["model_name"],
        "role_status": role_status,
        "speaker_roles": [{"speaker_id": spk, "role": role} for spk, role in roles.items()],
        "segments": [{**s, "role": roles.get(s["speaker"], "UNKNOWN")} for s in segments],
        "raw_model_output": raw_output,
        "timings_sec": {"total": round(time.perf_counter() - t0, 3)},
    }
 
    out_dir = os.path.join(cfg["paths"]["processed_dir"], call_id)
    try:
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "phase4b_result.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise RoleIdentificationError(ErrorCode.P4B_004_SAVE_FAILED, "Could not save roles",
                                      {"error": str(e)}) from e
 
    log.info(f"===== PHASE 4b DONE in {result['timings_sec']['total']}s =====")
    return result
 
 
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 4b - speaker roles")
    parser.add_argument("--call-id", required=True)
    args = parser.parse_args()
 
    from common.logger import attach_call_log, detach_call_log, setup_logging
 
    cfg = load_config()
    setup_logging(cfg["paths"]["log_dir"])
    handler = attach_call_log(args.call_id)
    p4_path = os.path.join(cfg["paths"]["processed_dir"], args.call_id, "phase4_result.json")
    try:
        if not os.path.isfile(p4_path):
            raise RoleIdentificationError(ErrorCode.P4B_001_INPUT_NOT_FOUND, "Run Phase 4 first", {"path": p4_path})
        with open(p4_path, encoding="utf-8") as f:
            res = run_phase4b(json.load(f), args.call_id, cfg)
        print(json.dumps({"role_status": res["role_status"], "speaker_roles": res["speaker_roles"]}, indent=2))
    except PipelineError as e:
        print(json.dumps({"status": "failed", **e.to_dict()}, indent=2, ensure_ascii=False))
        raise SystemExit(1)
    finally:
        detach_call_log(handler)