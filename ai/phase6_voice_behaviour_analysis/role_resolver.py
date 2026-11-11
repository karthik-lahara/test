"""
Agent / customer roles for the voice analysis (no LLM here).
 
Order:
    1. Manual override in config (phase6.role_mapping_override)
    2. "role" written on the segments (Phase 4b adds this)
    3. A mapping at the top of the JSON ("roles" / "speaker_roles" / "role_mapping")
    4. Last resort: first speaker = agent  (confidence "low")
"""
 
import re
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple
 
ROLE_WORDS = {
    "agent": {"agent", "advisor", "representative", "executive", "support", "employee", "operator"},
    "customer": {"customer", "client", "caller", "user", "consumer"},
}
 
 
def norm_role(x: Any) -> Optional[str]:
    t = str(x or "").strip().lower()
    if not t:
        return None
    tokens = set(re.split(r"[^a-z]+", t))
    for role, words in ROLE_WORDS.items():
        if tokens & words:
            return role
    return "other"
 
 
def _valid_mapping(mapping: Dict[str, Optional[str]], speakers: List[str]) -> bool:
    vals = [mapping.get(s) for s in speakers]
    return all(v is not None for v in vals) and "agent" in vals and "customer" in vals
 
 
def _mapping_from_value(d: Any) -> Dict[str, Optional[str]]:
    """Accepts {"SPEAKER_1": "agent"} or [{"speaker_id": "...", "role": "..."}] or {"mapping": {...}}."""
    if isinstance(d, dict):
        d = d.get("mapping", d)
        if isinstance(d, dict):
            return {str(k): norm_role(v) for k, v in d.items() if isinstance(v, str)}
    if isinstance(d, list):
        return {str(r.get("speaker_id")): norm_role(r.get("role")) for r in d if isinstance(r, dict)}
    return {}
 
 
def resolve_roles(diar: Dict[str, Any], segs: List[Dict[str, Any]], speakers: List[str],
                  override: Optional[Dict[str, str]] = None) -> Tuple[Dict[str, str], str, str]:
    """Returns (mapping, source, confidence)."""
    # 1) manual override
    if override:
        m = {s: norm_role(override.get(s)) for s in speakers}
        if _valid_mapping(m, speakers):
            return m, "manual_override", "high"
 
    # 2) role written on the segments
    raw = diar.get("speaker_segments") or diar.get("segments") or []
    votes: Dict[str, Counter] = defaultdict(Counter)
    for s in raw:
        role = norm_role(s.get("role") or s.get("speaker_role"))
        if role:
            votes[str(s.get("speaker", "UNKNOWN"))][role] += 1
    m = {sp: votes[sp].most_common(1)[0][0] for sp in votes}
    if _valid_mapping(m, speakers):
        return m, "segment_roles", "high"
 
    # 3) mapping stored at the top of the JSON
    for key in ("roles", "speaker_roles", "role_mapping"):
        m = _mapping_from_value(diar.get(key))
        if m and _valid_mapping(m, speakers):
            return m, f"json_{key}", "high"
 
    # 4) first speaker = agent (low confidence)
    order: List[str] = []
    for s in segs:
        if s["speaker"] not in order:
            order.append(s["speaker"])
    m = {sp: "other" for sp in speakers}
    if order:
        m[order[0]] = "agent"
    if len(order) > 1:
        m[order[1]] = "customer"
    return m, "assumed_first_speaker_is_agent", "low"
