"""
PHASE 1 orchestrator:  load -> basic checks -> denoise -> normalize -> save prepared.wav
 
    python -m phase1_audio_preparation.prepare_audio --input data/input/call.mp3 --call-id CALL001
"""
 
import argparse
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional
 
from common.audio_utils import audio_stats, rms, timer, write_wav
from common.config_loader import load_config
from common.exceptions import AudioPreparationError, ErrorCode, PipelineError
from common.logger import get_logger
from phase1_audio_preparation.audio_loader import load_audio
from phase1_audio_preparation.denoiser import denoise
from phase1_audio_preparation.normalizer import normalize
 
PHASE_NAME = "phase1_audio_preparation"
 
 
def run_phase1(input_path: str, call_id: str, cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = cfg or load_config()
    log = get_logger(__name__, call_id)
    sr = int(cfg["phase1"]["target_sample_rate"])
    keep = cfg["runtime"].get("keep_intermediate_files", True)
 
    out_dir = os.path.join(cfg["paths"]["processed_dir"], call_id)
    os.makedirs(out_dir, exist_ok=True)
    timings: Dict[str, float] = {}
 
    if not os.path.isfile(input_path):
        raise AudioPreparationError(ErrorCode.P1_001_INPUT_NOT_FOUND, "Input audio file not found",
                                    {"path": input_path})
 
    log.info(f"===== PHASE 1 START: {input_path} =====")
    with timer(timings, "total"):
        with timer(timings, "decode"):
            audio, sr, backend = load_audio(input_path, sr, call_id)
 
        duration = len(audio) / sr
        if duration < cfg["phase1"]["validation"]["min_duration_sec"]:
            raise AudioPreparationError(ErrorCode.P1_006_TOO_SHORT, f"Audio is only {duration:.2f}s",
                                        {"duration_sec": round(duration, 3)})
        if rms(audio) < cfg["phase1"]["validation"]["silence_rms_threshold"]:
            raise AudioPreparationError(ErrorCode.P1_008_SILENT_AUDIO, "Audio appears to be silent")
        original_stats = audio_stats(audio, sr)
 
        with timer(timings, "denoise"):
            audio, denoise_info = denoise(audio, sr, cfg, call_id)
        if keep:
            write_wav(os.path.join(out_dir, "denoised.wav"), audio, sr)
 
        with timer(timings, "normalize"):
            audio, norm_info = normalize(audio, sr, cfg, call_id)
 
        prepared_path = os.path.join(out_dir, "prepared.wav")
        try:
            write_wav(prepared_path, audio, sr)
        except Exception as e:
            raise AudioPreparationError(ErrorCode.P1_013_SAVE_FAILED, "Could not save prepared audio",
                                        {"path": prepared_path, "error": str(e)}) from e
 
    result = {
        "phase": PHASE_NAME,
        "status": "completed",
        "call_id": call_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "input": {"path": input_path, "decoder": backend},
        "output": {
            "prepared_audio_path": prepared_path,
            "sample_rate": sr,
            "channels": 1,
            "timeline_offset_sec": 0.0,
        },
        "original_stats": original_stats,
        "prepared_stats": audio_stats(audio, sr),
        "steps": {"denoise": denoise_info, "normalize": norm_info},
        "timings_sec": timings,
    }
    with open(os.path.join(out_dir, "phase1_result.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
 
    log.info(f"===== PHASE 1 DONE in {timings['total']}s -> {prepared_path} =====")
    return result
 
 
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 1 - audio preparation")
    parser.add_argument("--input", required=True)
    parser.add_argument("--call-id", required=True)
    args = parser.parse_args()
 
    from common.logger import attach_call_log, detach_call_log, setup_logging
    cfg = load_config()
    setup_logging(cfg["paths"]["log_dir"])
    handler = attach_call_log(args.call_id)
    try:
        print(json.dumps(run_phase1(args.input, args.call_id, cfg), indent=2))
    except PipelineError as e:
        print(json.dumps({"status": "failed", **e.to_dict()}, indent=2))
        raise SystemExit(1)
    finally:
        detach_call_log(handler)


