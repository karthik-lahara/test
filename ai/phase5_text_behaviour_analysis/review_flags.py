"""Step 4 - timestamp-specific human review flags from VERIFIED negative-behaviour evidence."""
 
from typing import Any, Dict, List
 
from phase5_text_behaviour_analysis.behaviour_analyzer import find_evidence_segments
from phase5_text_behaviour_analysis.labels import REVIEW_LABELS
 
 
def build_human_review_flags(segments: List[Dict[str, Any]], *behaviour_results) -> List[Dict[str, Any]]:
    """
    For agent / customer results the quote is searched only in that role's own lines
    (so the same words said by the other party are not flagged). The overall result searches all lines.
    """
    flags: Dict[tuple, Dict[str, Any]] = {}
    for result in behaviour_results:
        if not isinstance(result, dict):
            continue
        role = result.get("role")
        search = [s for s in segments if s["role"] == role] if role in ("agent", "customer") else segments
 
        for item in result.get("behaviours", []):
            label = str(item.get("label", "")).strip().lower()
            if label not in REVIEW_LABELS or not item.get("evidence_verified", False):
                continue
            for seg in find_evidence_segments(str(item.get("evidence", "")).strip(), search):
                key = (seg["start"], seg["end"], seg["speaker"])
                flag = flags.setdefault(key, {
                    "segment_id": seg.get("segment_id"),
                    "start": seg["start"], "end": seg["end"],
                    "speaker": seg["speaker"], "role": seg["role"], "text": seg["text"],
                    "behaviours": [], "review_required": True,
                    "review_status": "REQUIRE HUMAN REVIEW", "reasons": [],
                })
                if label not in flag["behaviours"]:
                    flag["behaviours"].append(label)
                reason = str(item.get("reason", "")).strip()
                if reason and reason not in flag["reasons"]:
                    flag["reasons"].append(reason)
 
    return sorted(flags.values(), key=lambda f: (f["start"], f["end"]))