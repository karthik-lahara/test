"""Turns speaker segments into short analysis units (long turns are split)."""
 
from typing import Any, Dict, List
 
 
def load_segments(diar: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = diar.get("speaker_segments") or diar.get("segments") or []
    segs = []
    for s in raw:
        segs.append({
            "start": float(s.get("start", s.get("start_time", 0.0))),
            "end": float(s.get("end", s.get("end_time", 0.0))),
            "speaker": str(s.get("speaker", "UNKNOWN")),
        })
    segs = [s for s in segs if s["end"] > s["start"]]
    segs.sort(key=lambda s: s["start"])
    return segs
 
 
def make_units(segs: List[Dict[str, Any]], roles: Dict[str, str], duration: float,
               min_unit: float = 0.5, max_unit: float = 4.0) -> List[Dict[str, Any]]:
    """Split each agent / customer turn into pieces of at most max_unit seconds."""
    units = []
    for s in segs:
        role = roles.get(s["speaker"], "other")
        if role not in ("agent", "customer"):
            continue
        a, b = max(0.0, s["start"]), min(duration, s["end"])
        t = a
        while b - t >= min_unit:
            e = min(b, t + max_unit)
            if b - e < min_unit:
                e = b
            units.append({"start": t, "end": e, "speaker": s["speaker"], "role": role})
            t = e
    return units
