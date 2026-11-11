import os
import time
from contextlib import contextmanager
from typing import Dict, Tuple
 
import numpy as np
import soundfile as sf
 
EPS = 1e-10
 
 
def get_device(preference: str = "auto") -> str:
    try:
        import torch
        has_cuda = torch.cuda.is_available()
    except ImportError:
        has_cuda = False
    if preference == "cpu":
        return "cpu"
    return "cuda" if has_cuda else "cpu"
 
 
def read_wav(path: str) -> Tuple[np.ndarray, int]:
    audio, sr = sf.read(path, dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    return audio.astype(np.float32), sr
 
 
def write_wav(path: str, audio: np.ndarray, sr: int) -> str:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    sf.write(path, np.clip(audio, -1.0, 1.0), sr, subtype="PCM_16")
    return path
 
 
def duration_sec(audio: np.ndarray, sr: int) -> float:
    return float(len(audio)) / float(sr) if sr else 0.0
 
 
def rms(audio: np.ndarray) -> float:
    if audio.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(audio, dtype=np.float64))))
 
 
def to_dbfs(value: float) -> float:
    return float(20.0 * np.log10(max(value, EPS)))
 
 
def audio_stats(audio: np.ndarray, sr: int) -> Dict[str, float]:
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    r = rms(audio)
    clipped = float(np.mean(np.abs(audio) >= 0.999)) if audio.size else 0.0
    return {
        "duration_sec": round(duration_sec(audio, sr), 3),
        "sample_rate": int(sr),
        "rms": round(r, 6),
        "rms_dbfs": round(to_dbfs(r), 2),
        "peak": round(peak, 6),
        "peak_dbfs": round(to_dbfs(peak), 2),
        "clipping_ratio": round(clipped, 6),
    }
 
 
@contextmanager
def timer(store: Dict[str, float], key: str):
    start = time.perf_counter()
    try:
        yield
    finally:
        store[key] = round(time.perf_counter() - start, 3)