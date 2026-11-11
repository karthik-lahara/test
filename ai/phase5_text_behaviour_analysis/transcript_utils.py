"""Reads segments from the previous phase and formats them for the prompts."""
 
from typing import Any, Dict, List
 
from common.exceptions import ErrorCode, TextBehaviourError
 
 
def load_segments(previous_result: Dict[str, Any], text_field: str = "text") -> List[Dict[str, Any]]:
    """
    Accepts the Phase 4b / 4 / 3 result. Keeps segments that have a speaker, text and valid times.
    text_field: "text" (original language, default) or "text_english".
    """
    raw = previous_result.get("segments")
    if not isinstance(raw, list) or not raw:
        raise TextBehaviourError(ErrorCode.P5_001_INPUT_NOT_FOUND, "No transcript segments found")
 
    segments = []
    for i, seg in enumerate(raw):
        if not isinstance(seg, dict):
            continue
        speaker = str(seg.get("speaker", "")).strip()
        text = str(seg.get(text_field) or seg.get("text") or "").strip()
        if not speaker or not text:
            continue
        try:
            start, end = float(seg["start"]), float(seg["end"])
        except (KeyError, TypeError, ValueError) as e:
            raise TextBehaviourError(ErrorCode.P5_001_INPUT_NOT_FOUND, f"Invalid timestamps in segment {i}") from e
        if start < 0 or end <= start:
            raise TextBehaviourError(ErrorCode.P5_001_INPUT_NOT_FOUND,
                                     f"Invalid timestamps in segment {i}: {start} -> {end}")
        segments.append({"segment_id": seg.get("segment_id", i + 1), "speaker": speaker, "role": "unknown",
                         "start": start, "end": end, "text": text})
 
    if not segments:
        raise TextBehaviourError(ErrorCode.P5_001_INPUT_NOT_FOUND, "No valid speaker-labelled text segments")
    segments.sort(key=lambda s: (s["start"], s["end"]))
    return segments
 
 
def format_summary_transcript(segments: List[Dict[str, Any]]) -> str:
    """Plain format used by the role and summary prompts."""
    return "\n".join(f"[{s['start']:.1f}-{s['end']:.1f}] {s['speaker']}: {s['text']}" for s in segments)
 
 
def format_behaviour_transcript(segments: List[Dict[str, Any]]) -> str:
    """Format with roles shown (once roles are known)."""
    lines = []
    for s in segments:
        label = s["speaker"] if s["role"] == "unknown" else f"{s['speaker']} ({s['role']})"
        lines.append(f"[{s['start']:.2f}s - {s['end']:.2f}s] {label}: {s['text']}")
    return "\n".join(lines)