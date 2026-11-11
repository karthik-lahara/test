"""Saves RTTM file + one wav clip per segment (input for Phase 3 ASR)."""
 
import os
from typing import Any, Dict, List, Optional
 
import numpy as np
 
from common.audio_utils import write_wav
from common.exceptions import DiarizationError, ErrorCode
from common.logger import get_logger
 
 
def save_rttm(segments: List[Dict[str, Any]], call_id: str, path: str) -> str:
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            for s in segments:
                f.write(f"SPEAKER {call_id} 1 {s['start']:.3f} {s['duration']:.3f} "
                        f"<NA> <NA> {s['speaker']} <NA> <NA>\n")
        return path
    except Exception as e:
        raise DiarizationError(ErrorCode.P2_007_EXPORT_FAILED, "Could not write RTTM",
                               {"path": path, "error": str(e)}) from e
 
 
def save_segment_clips(audio: np.ndarray, sr: int, segments: List[Dict[str, Any]], out_dir: str,
                       padding_sec: float = 0.1, call_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Writes one wav per segment and adds 'clip_path' to each segment."""
    log = get_logger(__name__, call_id)
    try:
        os.makedirs(out_dir, exist_ok=True)
        pad = int(padding_sec * sr)
        for s in segments:
            a = max(0, int(s["start"] * sr) - pad)
            b = min(len(audio), int(s["end"] * sr) + pad)
            name = f"seg_{s['segment_id']:04d}_{s['speaker']}_{s['start']:.2f}-{s['end']:.2f}.wav"
            path = os.path.join(out_dir, name)
            write_wav(path, audio[a:b], sr)
            s["clip_path"] = path
    except Exception as e:
        raise DiarizationError(ErrorCode.P2_007_EXPORT_FAILED, "Could not write segment clips",
                               {"dir": out_dir, "error": str(e)}) from e
    log.info(f"Saved {len(segments)} segment clips to {out_dir}")
    return segments
