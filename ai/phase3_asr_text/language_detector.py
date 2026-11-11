"""
Language detection + model routing.
 
detect_language()    -> Whisper (faster-whisper) on up to `sample_seconds` of speech
normalize_language() -> applies language_map (Whisper often says "ur" for Hindi calls -> "hi")
select_model()       -> "parakeet" | "indic" | "unknown"
"""
 
from typing import Any, Dict, List, Optional, Tuple
 
import numpy as np
 
from common.audio_utils import get_device
from common.exceptions import ASRError, ErrorCode
from common.logger import get_logger
 
 
def _speech_sample(audio: np.ndarray, sr: int, segments: List[Dict[str, Any]], max_sec: float) -> np.ndarray:
    """Join the longest speech segments (up to max_sec) so detection hears speech, not silence."""
    parts, total = [], 0.0
    for s in sorted(segments, key=lambda x: x["end"] - x["start"], reverse=True):
        a, b = int(s["start"] * sr), int(s["end"] * sr)
        parts.append(audio[a:b])
        total += s["end"] - s["start"]
        if total >= max_sec:
            break
    sample = np.concatenate(parts) if parts else audio
    return sample[: int(max_sec * sr)].astype(np.float32)
 
 
def detect_language(audio: np.ndarray, sr: int, segments: List[Dict[str, Any]], cfg: Dict[str, Any],
                    call_id: Optional[str] = None) -> Tuple[str, Optional[float]]:
    """Returns (raw_language_code, confidence). Blocking - run it with asyncio.to_thread."""
    log = get_logger(__name__, call_id)
    lcfg = cfg["phase3"]["language_detection"]
 
    if lcfg.get("force_language"):
        log.info(f"Language forced to '{lcfg['force_language']}' (detection skipped)")
        return lcfg["force_language"], None
 
    try:
        from faster_whisper import WhisperModel
 
        device = get_device(cfg["runtime"].get("device", "auto"))
        compute_type = "float16" if device == "cuda" else "int8"
        model = WhisperModel(lcfg.get("model", "small"), device=device, compute_type=compute_type)
 
        sample = _speech_sample(audio, sr, segments, float(lcfg.get("sample_seconds", 30)))
        # transcribe() detects the language right away; the returned segments generator is never used
        _, info = model.transcribe(sample, beam_size=1, without_timestamps=True)
        lang, prob = info.language, float(info.language_probability)
 
        del model
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass
    except Exception as e:
        raise ASRError(ErrorCode.P3_002_LANGUAGE_DETECTION_FAILED, "Language detection failed",
                       {"error": f"{type(e).__name__}: {e}"}) from e
 
    log.info(f"Detected language '{lang}' (confidence {prob:.2f})")
    return lang, round(prob, 4)
 
 
def normalize_language(lang: str, cfg: Dict[str, Any]) -> str:
    mapping = cfg["phase3"]["language_detection"].get("language_map") or {}
    return mapping.get(lang, lang)
 
 
def select_model(lang: str, cfg: Dict[str, Any]) -> str:
    routing = cfg["phase3"]["routing"]
    if lang in routing.get("parakeet_languages", []):
        return "parakeet"
    if lang in routing.get("indic_languages", []):
        return "indic"
    return "unknown"