"""
Decode any call recording (mp3, m4a, amr, wav, ...) into a mono float32 array.
Primary: ffmpeg   |   Fallback: soundfile + soxr
"""
 
import shutil
import subprocess
from typing import Optional, Tuple
 
import numpy as np
 
from common.exceptions import AudioPreparationError, ErrorCode
from common.logger import get_logger
 
 
def _load_with_ffmpeg(path: str, sample_rate: int) -> np.ndarray:
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
           "-i", path, "-vn", "-ac", "1", "-ar", str(sample_rate),
           "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="ignore").strip() or "ffmpeg failed")
    audio = np.frombuffer(proc.stdout, dtype=np.float32).copy()
    if audio.size == 0:
        raise RuntimeError("ffmpeg produced no audio samples")
    return audio
 
 
def _load_with_soundfile(path: str, sample_rate: int) -> np.ndarray:
    import soundfile as sf
    audio, sr = sf.read(path, dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != sample_rate:
        from phase1_audio_preparation.resampler import resample
        audio = resample(audio, sr, sample_rate)
    return audio.astype(np.float32)
 
 
def load_audio(path: str, sample_rate: int, call_id: Optional[str] = None) -> Tuple[np.ndarray, int, str]:
    """Returns (mono float32 audio, sample_rate, backend_used)."""
    log = get_logger(__name__, call_id)
    errors = []
 
    if shutil.which("ffmpeg"):
        try:
            audio = _load_with_ffmpeg(path, sample_rate)
            log.info(f"Decoded with ffmpeg -> {len(audio) / sample_rate:.2f}s @ {sample_rate} Hz mono")
            return audio, sample_rate, "ffmpeg"
        except Exception as e:
            errors.append(f"ffmpeg: {e}")
            log.warning(f"ffmpeg decode failed, trying soundfile: {e}")
    else:
        log.warning("ffmpeg not found on PATH, using soundfile fallback")
 
    try:
        audio = _load_with_soundfile(path, sample_rate)
        log.info(f"Decoded with soundfile -> {len(audio) / sample_rate:.2f}s @ {sample_rate} Hz mono")
        return audio, sample_rate, "soundfile"
    except Exception as e:
        errors.append(f"soundfile: {e}")
 
    raise AudioPreparationError(ErrorCode.P1_005_DECODE_FAILED,
                                "Could not decode audio file (corrupt or unsupported codec)",
                                {"path": path, "errors": errors})
