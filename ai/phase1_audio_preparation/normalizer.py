"""
Loudness normalization: loudness (LUFS, needs pyloudnorm) | rms | peak.
Always ends with a peak limiter so nothing clips.
"""
 
from typing import Any, Dict, Optional, Tuple
 
import numpy as np
 
from common.audio_utils import EPS, rms, to_dbfs
from common.exceptions import AudioPreparationError, ErrorCode
from common.logger import get_logger
 
 
def _db_to_gain(db: float) -> float:
    return float(10.0 ** (db / 20.0))
 
 
def _peak_limit(audio, ceiling_dbfs):
    ceiling = _db_to_gain(ceiling_dbfs)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > ceiling:
        audio = audio * (ceiling / peak)
    return audio
 
 
def _normalize_loudness(audio, sr, target_lufs):
    import pyloudnorm as pyln
    current = pyln.Meter(sr).integrated_loudness(audio)
    if not np.isfinite(current):
        raise ValueError("Loudness could not be measured (too quiet / too short)")
    return audio * _db_to_gain(target_lufs - current), float(current)
 
 
def normalize(audio: np.ndarray, sr: int, cfg: Dict[str, Any],
              call_id: Optional[str] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Returns (normalized_audio, info)."""
    log = get_logger(__name__, call_id)
    ncfg = cfg["phase1"]["normalize"]
 
    if not ncfg.get("enabled", True):
        return audio, {"method": "none"}
 
    method = ncfg.get("method", "loudness")
    ceiling = float(ncfg.get("peak_ceiling_dbfs", -1.0))
    info = {"method": method, "rms_dbfs_before": round(to_dbfs(rms(audio)), 2)}
 
    try:
        if method == "loudness":
            try:
                audio, measured = _normalize_loudness(audio, sr, float(ncfg["target_lufs"]))
                info["lufs_before"] = round(measured, 2)
                info["target_lufs"] = ncfg["target_lufs"]
            except ImportError:
                log.warning("pyloudnorm not installed, using RMS normalization instead")
                method = info["method"] = "rms"
            except ValueError as e:
                log.warning(f"{e}; using RMS normalization instead")
                method = info["method"] = "rms"
 
        if method == "rms":
            audio = audio * _db_to_gain(float(ncfg["target_rms_dbfs"]) - to_dbfs(rms(audio)))
        elif method == "peak":
            audio = audio * (_db_to_gain(ceiling) / (float(np.max(np.abs(audio))) + EPS))
        elif method != "loudness":
            raise ValueError(f"Unknown normalize method '{method}'")
 
        audio = _peak_limit(audio, ceiling).astype(np.float32)
    except Exception as e:
        raise AudioPreparationError(ErrorCode.P1_011_NORMALIZE_FAILED, "Normalization failed",
                                    {"method": method, "error": str(e)}) from e
 
    info["rms_dbfs_after"] = round(to_dbfs(rms(audio)), 2)
    log.info(f"Normalized ({info['method']}): {info['rms_dbfs_before']} -> {info['rms_dbfs_after']} dBFS")
    return audio, info
