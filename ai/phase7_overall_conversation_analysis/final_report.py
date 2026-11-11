"""Builds the compact FINAL report sent to the MERN callback (no evidence quotes / per-call timing lists)."""
 
from typing import Any, Dict, Optional
 
 
def compact_behaviour(result: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not result:
        return None
    return {
        "primary_behaviour": result.get("primary_behaviour", "neutral"),
        "primary_severity_weight": result.get("primary_severity_weight", 0),
        "overall_behaviour": result.get("overall_behaviour", "NEUTRAL"),
        "behaviour_labels": [b["label"] for b in result.get("behaviours", [])],
        "mixed_signals": result.get("mixed_signals", False),
        "reason": result.get("reason", ""),
    }
 
 
def compact_flag(f: Dict[str, Any]) -> Dict[str, Any]:
    keys = ("review_priority", "timestamp", "start", "end", "segment_id", "speaker", "role", "text",
            "english_translation", "priority_behaviour", "severity_weight", "behaviours",
            "evidence_sources", "corroborated", "reasons")
    return {k: f.get(k) for k in keys if k in f}
 
 
def build_final_report(output: Dict[str, Any]) -> Dict[str, Any]:
    summary = output.get("summary") or {}
    mapping = output["roles"]["mapping"]
    flags = output["human_review"]["flagged_segments"]
    voice = output.get("voice") or {}
    return {
        "call_id": output["call_id"],
        "status": "completed",
        "generated_at": output["completed_at"],
        "language": output["language"],
        "call_duration_sec": voice.get("call_duration_sec"),
        "roles": {
            "agent_speaker": next((sp for sp, r in mapping.items() if r == "agent"), None),
            "customer_speakers": [sp for sp, r in mapping.items() if r == "customer"],
            "confidence": output["roles"]["confidence"],
            "source": output["roles"]["source"],
        },
        "call_assessment": output["combined"]["call_assessment"],
        "summary": {k: v for k, v in summary.items() if k not in {"language", "agent_speaker", "client_speaker"}},
        "agent": {
            "text_behaviour": compact_behaviour(output.get("agent_behaviour")),
            "combined": output["combined"]["agent"],
        },
        "customer": {
            "text_behaviour": compact_behaviour(output.get("customer_behaviour")),
            "combined": output["combined"]["customer"],
        },
        "overall": {
            "text_behaviour": compact_behaviour(output.get("overall_conversation_behaviour")),
            "voice_call_result": voice.get("call_level_result"),
        },
        "human_review": {
            "review_required": bool(flags),
            "flagged_segment_count": len(flags),
            "corroborated_count": sum(1 for f in flags if f.get("corroborated")),
            "flags": [compact_flag(f) for f in flags],
        },
        "timing": {k: v for k, v in (output.get("timing") or {}).items() if k != "calls"},
        "errors": output.get("errors", []),
    }
