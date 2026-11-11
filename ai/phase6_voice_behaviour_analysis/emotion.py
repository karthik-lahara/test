"""Emotion2Vec prediction + label helpers."""
 
import os
import tempfile
import threading
from typing import Any, Dict, Optional, Tuple
 
import numpy as np
import soundfile as sf
 
# one shared Emotion2Vec model -> never call .generate() from two threads at once
EMOTION_MODEL_LOCK = threading.Lock()
 
VALENCE_WEIGHTS = {
    "happy": 1.0, "excited": 1.0, "surprise": 0.2, "neutral": 0.0,
    "sad": -0.7, "fear": -0.7, "disgust": -0.8, "angry": -1.0,
}
 
_EMOTION_MAP = {
    "angry": "angry", "anger": "angry", "生气": "angry", "愤怒": "angry",
    "happy": "happy", "happiness": "happy", "高兴": "happy", "开心": "happy",
    "sad": "sad", "sadness": "sad", "悲伤": "sad", "难过": "sad",
    "neutral": "neutral", "中性": "neutral",
    "fear": "fear", "fearful": "fear", "恐惧": "fear",
    "disgust": "disgust", "厌恶": "disgust",
    "surprise": "surprise", "惊讶": "surprise",
    "excited": "excited", "enthusiasm": "excited", "兴奋": "excited",
}
 
 
def canonical_emotion(label: Any) -> str:
    text = str(label).lower()
    for key, value in _EMOTION_MAP.items():
        if key in text:
            return value
    cleaned = text.replace("<", "").replace(">", "").replace("|", "").strip().replace(" ", "_")
    return cleaned or "unknown"
 
 
def parse_emotion2vec_output(output: Any) -> Tuple[Dict[str, float], str]:
    item = output
    while isinstance(item, list) and item:
        item = item[0]
    if not isinstance(item, dict):
        return {"unknown": 1.0}, "unknown"
    labels = item.get("labels") or item.get("label") or []
    scores = item.get("scores") or item.get("score") or []
    if isinstance(labels, str):
        labels = [labels]
    if isinstance(scores, (int, float)):
        scores = [scores]
    result: Dict[str, float] = {}
    for label, score in zip(labels, list(np.asarray(scores, dtype=float).flatten())):
        result[canonical_emotion(label)] = round(float(score), 4)
    if not result:
        return {"unknown": 1.0}, "unknown"
    return result, max(result, key=result.get)
 
 
def emotion_for_chunk(emotion_model, chunk: np.ndarray, sample_rate: int) -> Tuple[Dict[str, float], str, Optional[str]]:
    """Returns (scores, top_emotion, error_or_None)."""
    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            path = tmp.name
        sf.write(path, chunk, sample_rate)
        with EMOTION_MODEL_LOCK:
            out = emotion_model.generate(input=path, granularity="utterance", extract_embedding=False)
        scores, emotion = parse_emotion2vec_output(out)
        return scores, emotion, None
    except Exception as exc:
        return {"unknown": 1.0}, "unknown", str(exc)
    finally:
        if path and os.path.exists(path):
            os.remove(path)
 
 
def valence_from_scores(scores: Dict[str, float]) -> Optional[float]:
    known = {k: v for k, v in scores.items() if k in VALENCE_WEIGHTS}
    total = sum(known.values())
    if total <= 0:
        return None
    return round(sum(VALENCE_WEIGHTS[k] * v for k, v in known.items()) / total, 4)
 
 
def segment_label(emotion: str, conf: float, pitch_rise: bool, energy_rise: bool, min_conf: float) -> str:
    """Behaviour label that also uses the speaker's pitch / energy rise."""
    if emotion in {"unknown", "other", "unk"} or conf < min_conf:
        return "uncertain"
    if emotion in {"angry", "disgust"}:
        return "frustrated"
    if emotion == "fear":
        return "anxious"
    if emotion == "sad":
        return "sad"
    if emotion in {"happy", "excited"}:
        return "positive"
    if emotion == "surprise":
        return "surprised"
    if pitch_rise and energy_rise:
        return "elevated_vocal_intensity"
    return "calm"
 
 
def voice_behaviour(emotion: str) -> str:
    """Maps the model's emotion to the actionable label used in the final report."""
    if emotion == "angry":
        return "angry"
    if emotion == "disgust":
        return "frustrated"
    if emotion in {"fear", "sad"}:
        return "distressed"
    if emotion in {"happy", "excited"}:
        return "positive"
    if emotion == "surprise":
        return "surprised"
    if emotion == "neutral":
        return "neutral"
    return "uncertain"
