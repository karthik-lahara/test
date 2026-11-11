"""Resampling (16 kHz <-> 48 kHz for DeepFilterNet)."""
 
from typing import Optional
 
import numpy as np
 
from common.exceptions import AudioPreparationError, ErrorCode
from common.logger import get_logger
 
 
def resample(audio: np.ndarray, orig_sr: int, target_sr: int, call_id: Optional[str] = None) -> np.ndarray:
    if orig_sr == target_sr:
        return audio.astype(np.float32)
 
    log = get_logger(__name__, call_id)
    try:
        import soxr
        out = soxr.resample(audio, orig_sr, target_sr, quality="HQ")
        backend = "soxr"
    except ImportError:
        try:
            from math import gcd
            from scipy.signal import resample_poly
            g = gcd(orig_sr, target_sr)
            out = resample_poly(audio, target_sr // g, orig_sr // g)
            backend = "scipy"
        except Exception as e:
            raise AudioPreparationError(ErrorCode.P1_009_RESAMPLE_FAILED,
                                        "No resampler available (install soxr)", {"error": str(e)}) from e
    except Exception as e:
        raise AudioPreparationError(ErrorCode.P1_009_RESAMPLE_FAILED,
                                    f"Resampling {orig_sr}->{target_sr} failed", {"error": str(e)}) from e
 
    log.debug(f"Resampled {orig_sr} -> {target_sr} Hz with {backend}")
    return np.asarray(out, dtype=np.float32)