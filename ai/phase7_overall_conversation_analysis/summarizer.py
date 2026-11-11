"""Summary + follow_up + entities + customer interest (Phase 5 cleanup + follow_up check)."""
 
from typing import Any, Dict
 
from phase5_text_behaviour_analysis.ollama_client import OllamaClient
from phase5_text_behaviour_analysis.summarizer import validate_summary as _validate_p5
from phase5_text_behaviour_analysis.transcript_utils import format_summary_transcript
from phase7_overall_conversation_analysis.labels import FOLLOW_UP_VALUES, SUMMARY_SCHEMA
from phase7_overall_conversation_analysis.prompts import build_summary_prompt
 
 
def validate_summary(summary: Any, language: str, role_map, max_items: int, max_chars: int) -> Dict[str, Any]:
    if isinstance(summary, dict) and "follow_up" not in summary:
        raise ValueError("Summary is missing required field: follow_up")
    follow_up = str(summary.get("follow_up", "unclear")).strip().lower() if isinstance(summary, dict) else ""
    summary = _validate_p5(summary, language, role_map, max_items, max_chars)
    summary["follow_up"] = follow_up if follow_up in FOLLOW_UP_VALUES else "unclear"
    return summary
 
 
def run_summary(client: OllamaClient, segments, language: str, role_map: Dict[str, str],
                cfg: Dict[str, Any], log) -> Dict[str, Any]:
    p7 = cfg["phase7"]
    max_items = int(p7.get("max_items_per_list", 8))
    prompt = build_summary_prompt(format_summary_transcript(segments), language, role_map, max_items)
    log.info(f"Summary prompt: {len(prompt)} chars")
    result = client.generate(prompt, SUMMARY_SCHEMA, p7.get("summary_temperatures", [0.1]), stage="summary")
    return validate_summary(result, language, role_map, max_items, int(p7.get("max_item_chars", 250)))
