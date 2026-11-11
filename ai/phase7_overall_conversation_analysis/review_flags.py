"""
Timestamp-specific human review flags, ordered by severity.
 
    build_text_flags()   verified negative-behaviour quotes from the behaviour step
    merge_tone_flags()   impolite / abusive / threatening lines + long unclear lines from the tone check
    finalize_flags()     sort behaviours and flags by severity, set priority_behaviour, review_priority
"""
 
from typing import Any, Dict, List, Optional
 
from phase5_text_behaviour_analysis.behaviour_analyzer import find_evidence_segments
from phase7_overall_conversation_analysis.labels import (REVIEW_LABELS, SEVERITY_WEIGHTS, TONE_TO_LABEL,
                                                         UNCLEAR_REVIEW_LABEL)
 
 
def format_timestamp_range(start: float, end: float) -> str:
    """mm:ss.ss - mm:ss.ss"""
    return f"{int(start // 60):02d}:{start % 60:05.2f} - {int(end // 60):02d}:{end % 60:05.2f}"
 
 
def _new_flag(seg: Dict[str, Any]) -> Dict[str, Any]:
    return {"segment_id": seg.get("segment_id"), "start": seg["start"], "end": seg["end"],
            "speaker": seg["speaker"], "role": seg["role"], "text": seg["text"],
            "behaviours": [], "evidence_sources": [], "review_required": True,
            "review_status": "REQUIRE HUMAN REVIEW", "reasons": []}
 
 
def _add(flag: Dict[str, Any], label: str, reason: str, source: str) -> None:
    if label not in flag["behaviours"]:
        flag["behaviours"].append(label)
    if reason and reason not in flag["reasons"]:
        flag["reasons"].append(reason)
    if source not in flag["evidence_sources"]:
        flag["evidence_sources"].append(source)
 
 
def finalize_flags(flags: List[Dict[str, Any]], weights: Optional[Dict[str, int]] = None) -> List[Dict[str, Any]]:
    """Highest severity first; text+voice corroborated flags before single-source ones at equal severity."""
    weights = weights or SEVERITY_WEIGHTS
    for f in flags:
        f["behaviours"].sort(key=lambda l: weights.get(l, 0), reverse=True)
        top = f["behaviours"][0] if f["behaviours"] else ""
        f["priority_behaviour"] = top
        f["severity_weight"] = weights.get(top, 0)
        f["timestamp"] = format_timestamp_range(f["start"], f["end"])
        f["corroborated"] = "text" in f["evidence_sources"] and "voice" in f["evidence_sources"]
    flags.sort(key=lambda f: (-f["severity_weight"], not f["corroborated"], f["start"], f["end"]))
    for i, f in enumerate(flags, start=1):
        f["review_priority"] = i
    return flags
 
 
def build_text_flags(segments: List[Dict[str, Any]], *behaviour_results, min_severity: int = 1) -> List[Dict[str, Any]]:
    """Agent / customer quotes are searched only in that role's own lines; overall searches all lines."""
    flags: Dict[tuple, Dict[str, Any]] = {}
    for result in behaviour_results:
        if not isinstance(result, dict):
            continue
        role = result.get("role")
        search = [s for s in segments if s["role"] == role] if role in ("agent", "customer") else segments
        for item in result.get("behaviours", []):
            label = str(item.get("label", "")).strip().lower()
            if (label not in REVIEW_LABELS or SEVERITY_WEIGHTS.get(label, 0) < min_severity
                    or not item.get("evidence_verified", False)):
                continue
            for seg in find_evidence_segments(str(item.get("evidence", "")).strip(), search):
                key = (seg["start"], seg["end"], seg["speaker"])
                flag = flags.setdefault(key, _new_flag(seg))
                _add(flag, label, str(item.get("reason", "")).strip(), "text")
    return finalize_flags(list(flags.values()))
 
 
def merge_tone_flags(flags: List[Dict[str, Any]], tone_results: List[Dict[str, Any]],
                     unclear_min_chars: int = 40) -> List[Dict[str, Any]]:
    """Adds tone-check flags and attaches the English translation to every flagged line."""
    by_key = {(f["start"], f["end"], f["speaker"]): f for f in flags}
    english_by_key = {}
    for item in tone_results:
        key = (item["start"], item["end"], item["speaker"])
        if item.get("english"):
            english_by_key[key] = item["english"]
        tone = item["tone"]
        if tone in TONE_TO_LABEL:
            label, reason = TONE_TO_LABEL[tone], f"Line-by-line tone check judged this line {tone}."
        elif tone == "unclear" and len(item["text"]) >= unclear_min_chars:
            label = UNCLEAR_REVIEW_LABEL
            reason = ("The text of this line is too garbled to judge the tone automatically; "
                      "listen to the audio at this timestamp.")
        else:
            continue
        flag = by_key.setdefault(key, _new_flag(item))
        _add(flag, label, reason, "text")
 
    for key, flag in by_key.items():
        if english_by_key.get(key):
            flag["english_translation"] = english_by_key[key]
    return finalize_flags(list(by_key.values()))