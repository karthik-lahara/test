"""
Loads Emotion2Vec (FunASR) and Silero VAD ONCE per process (cached).
Records how long loading took so it can be reported in the timing block.
"""
 
import time
from typing import Any, Dict, Optional, Tuple
 
from common.exceptions import ErrorCode, VoiceBehaviourError
from common.logger import get_logger
 
_CACHE: Dict[str, Any] = {}
 
 
def load_models(cfg: Dict[str, Any], call_id: Optional[str] = None) -> Tuple[Any, Any, float]:
    """Returns (emotion_model, vad_model, load_seconds). load_seconds is 0 when already cached."""
    name = cfg["phase6"]["emotion_model"]
    if name in _CACHE:
        return _CACHE[name], _CACHE["vad"], 0.0
 
    log = get_logger(__name__, call_id)
    start = time.perf_counter()
    try:
        from funasr import AutoModel
        from silero_vad import load_silero_vad
 
        log.info(f"Loading Emotion2Vec '{name}' (first call only)...")
        emotion_model = AutoModel(model=name, disable_update=True)
        log.info("Loading Silero VAD...")
        vad_model = load_silero_vad()
    except Exception as e:
        raise VoiceBehaviourError(ErrorCode.P6_002_MODEL_LOAD_FAILED, "Could not load voice models",
                                  {"model": name, "error": f"{type(e).__name__}: {e}"}) from e
 
    seconds = time.perf_counter() - start
    log.info(f"Voice models loaded in {seconds:.2f}s")
    _CACHE[name], _CACHE["vad"] = emotion_model, vad_model
    return emotion_model, vad_model, seconds
