"""Final report: per-unit timeline, per-role emotion runs / changes, anger-frustration timestamps."""

from collections import Counter
from typing import Any, Dict, List

from phase6_voice_behaviour_analysis.emotion import voice_behaviour

REVIEW_BEHAVIOURS = {"angry", "frustrated", "distressed"}

INTERPRETATION_NOTES = [
    "Emotion2Vec returns general emotion classes; angry is reported as angry and disgust-like predictions as frustrated.",
    "Rudeness cannot be reliably identified from audio emotion alone. It requires transcription/text analysis "
    "of the words used, so rude is not guessed here.",
    "A model score is not a calibrated probability and must not be presented as verified accuracy.",
    "Pitch and energy are supporting voice features only; they do not independently prove anger.",
    "Emotion changes are reported when consecutive analysed windows change behaviour label.",
    "Review flagged timestamps by listening before making decisions about a caller or agent.",
]


def mmss(sec: float) -> str:
    sec = max(0, int(float(sec)))
    return f"{sec // 60:02d}:{sec % 60:02d}"


def build_timeline(rows: List[Dict[str, Any]], cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Keeps every unit's prediction; low scores are marked, not hidden."""
    r6 = cfg["phase6"]["report"]
    high, medium = float(r6.get("high_score", 0.60)), float(r6.get("medium_score", 0.35))
    timeline = []
    for r in sorted(rows, key=lambda x: x["start"]):
        emotion = str(r.get("emotion", "unknown")).lower()
        conf = float(r.get("emotion_confidence", 0.0) or 0.0)
        behaviour = "uncertain" if emotion in {"unknown", "other", "unk"} else voice_behaviour(emotion)
        timeline.append({
            "unit_id": r["unit_id"],
            "start_sec": round(float(r["start"]), 2),
            "end_sec": round(float(r["end"]), 2),
            "timestamp": f"{mmss(r['start'])}-{mmss(r['end'])}",
            "speaker_id": r.get("speaker"),
            "role": r.get("role", "unknown"),
            "predicted_emotion": emotion,
            "voice_behaviour": behaviour,
            "behaviour_label": r.get("behaviour_label"),          # pitch/energy-aware label
            "valence": r.get("valence"),
            "model_score": round(conf, 4),
            "confidence_band": ("higher_model_score" if conf >= high else
                                "medium_model_score" if conf >= medium else "low_model_score"),
            "emotion_scores": {str(k): round(float(v), 4) for k, v in (r.get("emotion_scores") or {}).items()},
            "pitch_mean_hz": r.get("pitch_mean_hz"),
            "energy_mean": r.get("energy_mean"),
            "voice_level_change": r.get("voice_level_change", "not_available"),
            "pause_count": r.get("pause_count"),
            "longest_pause_seconds": r.get("longest_pause_seconds"),
            "gap_before_sec": r.get("gap_before_sec"),
            "overlap_sec": r.get("overlap_sec"),
            "human_review_recommended": behaviour in REVIEW_BEHAVIOURS or conf < medium,
        })
    return timeline


def build_role_report(timeline: List[Dict[str, Any]], role: str, merge_gap: float = 0.5) -> Dict[str, Any]:
    items = [x for x in timeline if x["role"] == role]
    if not items:
        return {"dominant_emotion": "unknown", "emotion_share_percent": {}, "started_as": None, "ended_as": None,
                "emotion_timeline": [], "emotion_changes": [], "angry_or_frustrated_timestamps": []}

    totals: Counter = Counter()
    for x in items:
        totals[x["predicted_emotion"]] += max(0, x["end_sec"] - x["start_sec"])

    runs: List[Dict[str, Any]] = []
    for x in items:
        label = x["voice_behaviour"]
        if runs and runs[-1]["voice_behaviour"] == label and x["start_sec"] <= runs[-1]["end_sec"] + merge_gap:
            runs[-1]["end_sec"] = x["end_sec"]
            runs[-1]["segment_count"] += 1
        else:
            runs.append({"start_sec": x["start_sec"], "end_sec": x["end_sec"], "timestamp": x["timestamp"],
                         "voice_behaviour": label, "predicted_emotion": x["predicted_emotion"],
                         "segment_count": 1})

    changes = [{"change_at_sec": cur["start_sec"], "timestamp": mmss(cur["start_sec"]),
                "from": prev["voice_behaviour"], "to": cur["voice_behaviour"]}
               for prev, cur in zip(runs, runs[1:]) if prev["voice_behaviour"] != cur["voice_behaviour"]]

    flagged = [{"start_sec": x["start_sec"], "end_sec": x["end_sec"], "timestamp": x["timestamp"],
                "emotion": x["predicted_emotion"], "voice_behaviour": x["voice_behaviour"],
                "model_score": x["model_score"],
                "reason": "Anger/frustration/distress-like voice prediction; listen to verify."}
               for x in items if x["voice_behaviour"] in REVIEW_BEHAVIOURS]

    total_time = sum(totals.values()) or 1.0
    return {
        "dominant_emotion": totals.most_common(1)[0][0],
        "emotion_share_percent": {k: round(100 * v / total_time, 1) for k, v in totals.most_common()},
        "started_as": runs[0]["voice_behaviour"],
        "ended_as": runs[-1]["voice_behaviour"],
        "emotion_timeline": runs,
        "emotion_changes": changes,
        "angry_or_frustrated_timestamps": flagged,
    }