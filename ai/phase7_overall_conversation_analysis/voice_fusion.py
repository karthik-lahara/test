"""
Text + voice fusion (no model - pure Python).

    align_segments()      every transcript line gets the voice units that overlap it
                          (dominant voice behaviour by overlap time, strongest negative voice unit)
    merge_voice_flags()   negative voice units become review flags; a line flagged by BOTH text and voice
                          is marked "corroborated" and ranked first at equal severity
    role_assessment()     per role: text verdict + voice negative share -> one combined assessment
"""

from collections import Counter
from typing import Any, Dict, List, Optional

from phase7_overall_conversation_analysis.labels import REVIEW_LABELS, SEVERITY_WEIGHTS, TONE_TO_LABEL
from phase7_overall_conversation_analysis.review_flags import _add, _new_flag, finalize_flags

NEGATIVE_VOICE = {"angry", "frustrated", "distressed"}
NEGATIVE_VOICE_EMOTIONS = {"angry", "disgust", "fear", "sad"}


def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def voice_weights(cfg: Dict[str, Any]) -> Dict[str, int]:
    """Severity weights for text labels + voice labels (voice:angry etc.)."""
    vw = cfg["phase7"]["fusion"].get("voice_severity_weights",
                                     {"angry": 45, "frustrated": 35, "distressed": 25})
    return {**SEVERITY_WEIGHTS, **{f"voice:{k}": int(v) for k, v in vw.items()}}


def align_segments(segments: List[Dict[str, Any]], voice_timeline: List[Dict[str, Any]],
                   tone_results: List[Dict[str, Any]], text_flags: List[Dict[str, Any]],
                   voice_min_score: float = 0.35) -> List[Dict[str, Any]]:
    tone_by_key = {(t["start"], t["end"], t["speaker"]): t for t in tone_results}
    # only real negative behaviours count (not "unclear_text")
    flagged_keys = {(f["start"], f["end"], f["speaker"]) for f in text_flags
                    if any(b in REVIEW_LABELS for b in f["behaviours"])}
    out = []
    for s in segments:
        key = (s["start"], s["end"], s["speaker"])
        units = [u for u in voice_timeline
                 if u.get("speaker_id") == s["speaker"] and _overlap(s["start"], s["end"], u["start_sec"], u["end_sec"]) > 0]
        by_time: Counter = Counter()
        for u in units:
            by_time[u["voice_behaviour"]] += _overlap(s["start"], s["end"], u["start_sec"], u["end_sec"])
        neg = [u for u in units if u["voice_behaviour"] in NEGATIVE_VOICE]
        strongest = max(neg, key=lambda u: u.get("model_score", 0)) if neg else None
        tone = tone_by_key.get(key)
        text_neg = key in flagged_keys or (tone is not None and tone["tone"] in TONE_TO_LABEL)
        voice_neg = strongest is not None and strongest.get("model_score", 0) >= voice_min_score

        out.append({
            "segment_id": s.get("segment_id"), "start": s["start"], "end": s["end"],
            "speaker": s["speaker"], "role": s["role"], "text": s["text"],
            "english": tone["english"] if tone else None,
            "text_tone": tone["tone"] if tone else None,
            "voice_behaviour": by_time.most_common(1)[0][0] if by_time else None,
            "voice_units": len(units),
            "strongest_negative_voice": ({"voice_behaviour": strongest["voice_behaviour"],
                                          "emotion": strongest["predicted_emotion"],
                                          "model_score": strongest["model_score"],
                                          "voice_level_change": strongest.get("voice_level_change")}
                                         if strongest else None),
            "combined_signal": ("negative_text_and_voice" if text_neg and voice_neg else
                                "negative_text_only" if text_neg else
                                "negative_voice_only" if voice_neg else "none"),
        })
    return out


def merge_voice_flags(flags: List[Dict[str, Any]], aligned: List[Dict[str, Any]],
                      cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    min_score = float(cfg["phase7"]["fusion"].get("voice_flag_min_score", 0.35))
    by_key = {(f["start"], f["end"], f["speaker"]): f for f in flags}
    for a in aligned:
        v = a["strongest_negative_voice"]
        if not v or v["model_score"] < min_score:
            continue
        key = (a["start"], a["end"], a["speaker"])
        flag = by_key.setdefault(key, _new_flag(a))
        reason = (f"Voice analysis: {v['voice_behaviour']}-like voice ({v['emotion']}, model score "
                  f"{v['model_score']}, {v.get('voice_level_change') or 'no level data'}). Listen to verify.")
        _add(flag, f"voice:{v['voice_behaviour']}", reason, "voice")
        if a.get("english") and "english_translation" not in flag:
            flag["english_translation"] = a["english"]
    return finalize_flags(list(by_key.values()), voice_weights(cfg))


def role_assessment(role: str, text_result: Optional[Dict[str, Any]], voice_report: Optional[Dict[str, Any]],
                    cfg: Dict[str, Any]) -> Dict[str, Any]:
    threshold = float(cfg["phase7"]["fusion"].get("voice_negative_share_pct", 30.0))
    text_overall = (text_result or {}).get("overall_behaviour", "NEUTRAL")
    shares = (voice_report or {}).get("emotion_share_percent") or {}
    neg_share = round(sum(v for k, v in shares.items() if k in NEGATIVE_VOICE_EMOTIONS), 1)
    voice_available = bool(voice_report and voice_report.get("emotion_timeline"))
    voice_negative = voice_available and neg_share >= threshold

    if text_overall == "NEGATIVE" and voice_negative:
        assessment = "negative_confirmed"
    elif text_overall == "NEGATIVE":
        assessment = "negative_text"
    elif voice_negative:
        assessment = "negative_voice"
    elif text_overall == "POSITIVE":
        assessment = "positive"
    else:
        assessment = "neutral"

    return {
        "role": role,
        "assessment": assessment,
        "text_overall_behaviour": text_overall,
        "text_primary_behaviour": (text_result or {}).get("primary_behaviour", "neutral"),
        "voice_available": voice_available,
        "voice_dominant_emotion": (voice_report or {}).get("dominant_emotion"),
        "voice_negative_share_pct": neg_share if voice_available else None,
        "voice_started_as": (voice_report or {}).get("started_as"),
        "voice_ended_as": (voice_report or {}).get("ended_as"),
        "voice_emotion_changes": len((voice_report or {}).get("emotion_changes") or []),
        "text_voice_agree": (None if not voice_available
                             else (text_overall == "NEGATIVE") == bool(voice_negative)),
    }


ASSESSMENT_ORDER = ["negative_confirmed", "negative_text", "negative_voice", "neutral", "positive"]


def call_assessment(*role_results: Dict[str, Any]) -> str:
    found = [r["assessment"] for r in role_results if r]
    return min(found, key=ASSESSMENT_ORDER.index) if found else "neutral"