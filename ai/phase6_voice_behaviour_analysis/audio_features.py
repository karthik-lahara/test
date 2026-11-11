"""Pitch / energy per unit (Praat via parselmouth) and pauses for the whole call (Silero VAD)."""
 
from typing import Any, Dict, List, Tuple
 
import numpy as np
 
 
def extract_features(segment: np.ndarray, sample_rate: int) -> Dict[str, Any]:
    """Runs in a worker process, so it only uses its arguments (no globals)."""
    energy = float(np.sqrt(np.mean(segment ** 2))) if len(segment) else 0.0
    feats = {"pitch_mean_hz": None, "pitch_min_hz": None, "pitch_max_hz": None,
             "pitch_std_hz": None, "energy_mean": round(energy, 6)}
    try:
        import parselmouth
 
        snd = parselmouth.Sound(segment.astype(np.float64), sampling_frequency=sample_rate)
        f0 = snd.to_pitch_ac(time_step=0.01, pitch_floor=65, pitch_ceiling=500).selected_array["frequency"]
        f0 = f0[np.isfinite(f0) & (f0 > 0)]
        if len(f0):
            feats.update(pitch_mean_hz=round(float(np.mean(f0)), 2), pitch_min_hz=round(float(np.min(f0)), 2),
                         pitch_max_hz=round(float(np.max(f0)), 2), pitch_std_hz=round(float(np.std(f0)), 2))
    except Exception as exc:  # pitch is optional - keep energy
        feats["pitch_error"] = str(exc)
    return feats
 
 
def detect_pauses(audio: np.ndarray, sample_rate: int, vad_model, vcfg: Dict[str, Any]) -> List[Tuple[float, float]]:
    """Pauses = gaps between speech regions found by Silero VAD, as (start, end) seconds."""
    import torch
    from silero_vad import get_speech_timestamps
 
    total = len(audio) / sample_rate
    min_pause = float(vcfg.get("min_pause_sec", 0.30))
    speech = get_speech_timestamps(
        torch.from_numpy(audio).float(), vad_model, sampling_rate=sample_rate,
        threshold=float(vcfg.get("threshold", 0.5)),
        min_speech_duration_ms=int(vcfg.get("min_speech_ms", 100)),
        min_silence_duration_ms=int(vcfg.get("min_silence_ms", 100)),
        speech_pad_ms=int(vcfg.get("speech_pad_ms", 30)),
        return_seconds=True)
    pauses, prev_end = [], 0.0
    for chunk in speech:
        if chunk["start"] - prev_end >= min_pause:
            pauses.append((prev_end, chunk["start"]))
        prev_end = chunk["end"]
    if total - prev_end >= min_pause:
        pauses.append((prev_end, total))
    return pauses
 
 
def pause_stats(pauses: List[Tuple[float, float]], seg_start: float, seg_end: float) -> Dict[str, Any]:
    clipped = [(max(a, seg_start), min(b, seg_end)) for a, b in pauses if min(b, seg_end) > max(a, seg_start)]
    seg_len = seg_end - seg_start
    total = sum(b - a for a, b in clipped)
    return {
        "pause_count": len(clipped),
        "total_pause_seconds": round(total, 2),
        "longest_pause_seconds": round(max((b - a for a, b in clipped), default=0.0), 2),
        "pause_ratio": round(total / seg_len, 4) if seg_len > 0 else 0.0,
    }
