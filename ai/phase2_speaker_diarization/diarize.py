"""
PHASE 2 orchestrator: prepared.wav -> pyannote -> post-process -> RTTM + clips + phase2_result.json
 
    python -m phase2_speaker_diarization.diarize --call-id CALL001
"""
 
import argparse
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional
 
from common.audio_utils import read_wav, timer
from common.config_loader import load_config
from common.exceptions import DiarizationError, ErrorCode, PipelineError
from common.logger import get_logger
from phase2_speaker_diarization.diarizer import run_diarization
from phase2_speaker_diarization.exporter import save_rttm, save_segment_clips
from phase2_speaker_diarization.model_loader import load_diarization_pipeline
from phase2_speaker_diarization.postprocessor import postprocess
 
PHASE_NAME = "phase2_speaker_diarization"
 
 
def run_phase2(prepared_audio_path: str, call_id: str, cfg: Optional[Dict[str, Any]] = None,
               timeline_offset_sec: float = 0.0) -> Dict[str, Any]:
    cfg = cfg or load_config()
    log = get_logger(__name__, call_id)
    ecfg = cfg["phase2"]["export"]
    out_dir = os.path.join(cfg["paths"]["processed_dir"], call_id)
    os.makedirs(out_dir, exist_ok=True)
    timings: Dict[str, float] = {}
 
    log.info(f"===== PHASE 2 START: {prepared_audio_path} =====")
    if not os.path.isfile(prepared_audio_path):
        raise DiarizationError(ErrorCode.P2_001_INPUT_NOT_FOUND, "Prepared audio not found",
                               {"path": prepared_audio_path})
 
    with timer(timings, "total"):
        audio, sr = read_wav(prepared_audio_path)
        duration = len(audio) / sr
 
        with timer(timings, "model_load"):
            pipeline, device = load_diarization_pipeline(cfg, call_id)
        with timer(timings, "diarization"):
            raw = run_diarization(pipeline, audio, sr, cfg, call_id)
        with timer(timings, "postprocess"):
            data = postprocess(raw, duration, cfg, timeline_offset_sec, call_id)
        with timer(timings, "export"):
            rttm_path = None
            if ecfg.get("save_rttm", True):
                rttm_path = save_rttm(data["segments"], call_id, os.path.join(out_dir, "diarization.rttm"))
            if ecfg.get("save_segment_clips", True):
                save_segment_clips(audio, sr, data["segments"], os.path.join(out_dir, "segments"),
                                   float(ecfg.get("clip_padding_sec", 0.1)), call_id)
 
    result = {
        "phase": PHASE_NAME,
        "status": "completed",
        "call_id": call_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "model": cfg["phase2"]["model_name"],
        "device": device,
        "input": {"prepared_audio_path": prepared_audio_path, "timeline_offset_sec": timeline_offset_sec},
        "output": {"rttm_path": rttm_path,
                   "segments_dir": os.path.join(out_dir, "segments") if ecfg.get("save_segment_clips", True) else None},
        **data,
        "raw_segment_count": len(raw),
        "timings_sec": timings,
    }
    with open(os.path.join(out_dir, "phase2_result.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
 
    log.info(f"===== PHASE 2 DONE in {timings['total']}s: {data['num_speakers']} speakers, "
             f"{len(data['segments'])} segments =====")
    return result
 
 
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 2 - speaker diarization")
    parser.add_argument("--call-id", required=True)
    parser.add_argument("--audio", help="default: data/processed/<call_id>/prepared.wav")
    args = parser.parse_args()
 
    from common.logger import attach_call_log, detach_call_log, setup_logging
    cfg = load_config()
    setup_logging(cfg["paths"]["log_dir"])
    handler = attach_call_log(args.call_id)
 
    audio_path = args.audio or os.path.join(cfg["paths"]["processed_dir"], args.call_id, "prepared.wav")
    try:
        res = run_phase2(audio_path, args.call_id, cfg)
        print(json.dumps({k: v for k, v in res.items() if k != "segments"}, indent=2))
    except PipelineError as e:
        print(json.dumps({"status": "failed", **e.to_dict()}, indent=2))
        raise SystemExit(1)
    finally:
        detach_call_log(handler)
