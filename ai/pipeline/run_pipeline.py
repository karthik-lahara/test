"""
Runs the complete pipeline for one call:

    P1 audio prep -> P2 diarization -> P3 speech-to-text -> P4 translation -> P4b speaker roles
    -> [P5 text behaviour, optional] -> P6 voice behaviour -> P7 overall (text + voice) -> final report

Phase 7 contains the newer text analysis (summary + follow_up + severity + tone check),
so Phase 5 is OFF by default (pipeline.run_phase5 in config.yaml) to avoid running gemma twice.

The FastAPI background worker (POST /api/v1/analyze) calls run_pipeline() after downloading the audio
from S3, then POSTs result["final_report"] (or result["error"]) to the MERN callback.

    python -m pipeline.run_pipeline --input data/input/call1.mp3 --call-id CALL001
    python -m pipeline.run_pipeline --url "https://...presigned.m4a" --call-id CALL001
    python -m pipeline.run_pipeline --call-id CALL001     # uses STATIC_AUDIO_URL from .env
"""

import argparse
import json
import os
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from common.audio_fetcher import download_audio
from common.config_loader import load_config
from common.exceptions import ErrorCode, PipelineError
from common.logger import attach_call_log, detach_call_log, get_logger, setup_logging
from phase1_audio_preparation.prepare_audio import run_phase1
from phase2_speaker_diarization.diarize import run_phase2
from phase3_asr_text.transcribe import run_phase3
from phase4_language_translation.translate import run_phase4
from phase4b_speaker_roles.identify_roles import run_phase4b
from phase5_text_behaviour_analysis.analyze_text_behaviour import run_phase5
from phase6_voice_behaviour_analysis.analyze_voice_behaviour import run_phase6
from phase7_overall_conversation_analysis.analyze_overall_conversation import run_phase7


def run_pipeline(input_path: Optional[str], call_id: str, metadata: Optional[Dict[str, Any]] = None,
                 cfg: Optional[Dict[str, Any]] = None, audio_url: Optional[str] = None) -> Dict[str, Any]:
    """Never raises: returns status completed | failed (with error code).

    Audio source, in priority order: input_path (local file) -> audio_url -> source.static_audio_url.
    """
    cfg = cfg or load_config()
    setup_logging(cfg["paths"]["log_dir"])
    handler = attach_call_log(call_id)
    log = get_logger(__name__, call_id)
    run_p5 = bool(cfg.get("pipeline", {}).get("run_phase5", False))

    result: Dict[str, Any] = {"call_id": call_id, "metadata": metadata or {}, "status": "processing",
                              "started_at": datetime.now(timezone.utc).isoformat(), "phases": {},
                              "final_report": None, "error": None}
    phases = result["phases"]
    try:
        if not input_path:
            url = audio_url or cfg.get("source", {}).get("static_audio_url")
            if not url:
                raise PipelineError(ErrorCode.P1_001_INPUT_NOT_FOUND,
                                    "No audio given: pass --input, --url, or set STATIC_AUDIO_URL",
                                    phase="phase1_audio_preparation")
            input_path = download_audio(url, call_id, cfg)
            result["metadata"].setdefault("source_url", url.split("?", 1)[0])

        p1 = run_phase1(input_path, call_id, cfg)
        phases["phase1_audio_preparation"] = p1
        prepared = p1["output"]["prepared_audio_path"]

        p2 = run_phase2(prepared, call_id, cfg, timeline_offset_sec=p1["output"]["timeline_offset_sec"])
        phases["phase2_speaker_diarization"] = p2

        p3 = run_phase3(p2, call_id, cfg)
        phases["phase3_asr_text"] = p3
        language = p3["language"]["final"]

        p4 = run_phase4(p3, call_id, cfg)
        phases["phase4_language_translation"] = p4

        p4b = run_phase4b(p4, call_id, cfg)
        phases["phase4b_speaker_roles"] = p4b

        p5_roles = {}
        if run_p5:
            p5 = run_phase5(p4b, call_id, cfg, language=language)
            phases["phase5_text_behaviour_analysis"] = p5
            p5_roles = p5.get("roles", {})

        p6 = run_phase6(prepared, {**p4b, "roles": p5_roles}, call_id, cfg)
        phases["phase6_voice_behaviour_analysis"] = p6

        p7 = run_phase7(p4b, call_id, cfg, language=language, voice_result=p6)
        phases["phase7_overall_conversation_analysis"] = p7
        result["final_report"] = p7["final_report"]

        result["status"] = "completed"
    except PipelineError as e:
        log.error(f"Pipeline failed: {e}")
        result["status"] = "failed"
        result["error"] = e.to_dict()
    except Exception as e:  # last-resort safety net
        log.error(f"Unexpected error: {e}\n{traceback.format_exc()}")
        result["status"] = "failed"
        result["error"] = {"error_code": ErrorCode.GEN_999_UNKNOWN.value, "error_name": ErrorCode.GEN_999_UNKNOWN.name,
                           "phase": "unknown", "message": str(e), "details": {"type": type(e).__name__}}
    finally:
        result["finished_at"] = datetime.now(timezone.utc).isoformat()
        out_path = os.path.join(cfg["paths"]["results_dir"], f"{call_id}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False, default=str)
        log.info(f"Result written: {out_path} (status={result['status']})")
        detach_call_log(handler)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the full call-analysis pipeline for one call")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--input", help="path to a local call recording")
    src.add_argument("--url", help="URL to download the recording from (e.g. S3 presigned)")
    parser.add_argument("--call-id", required=True)
    args = parser.parse_args()

    res = run_pipeline(args.input, args.call_id, audio_url=args.url)
    print("=" * 60)
    print(f"call_id : {res['call_id']}")
    print(f"status  : {res['status']}")
    if res["error"]:
        print(f"error   : {res['error']['error_code']} - {res['error']['message']}")
    fr = res.get("final_report")
    if fr:
        print(f"call    : {fr['call_assessment']}")
        print(f"agent   : {fr['agent']['combined']['assessment']}  customer: {fr['customer']['combined']['assessment']}")
        print(f"review  : {fr['human_review']['flagged_segment_count']} flags "
              f"({fr['human_review']['corroborated_count']} text+voice)")
    print("=" * 60)
    raise SystemExit(0 if res["status"] == "completed" else 1)