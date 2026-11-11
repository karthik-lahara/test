"""Step 2 - conversation summary + entities + customer interest (gemma via Ollama)."""
 
import re
from typing import Any, Dict, List, Optional
 
from phase5_text_behaviour_analysis.labels import (COMPLETION_STATUSES, ENTITY_CATEGORIES, INTEREST_LEVELS,
                                                   RESOLUTION_STATUSES, SUMMARY_SCHEMA)
from phase5_text_behaviour_analysis.ollama_client import OllamaClient
from phase5_text_behaviour_analysis.prompts import build_summary_prompt
from phase5_text_behaviour_analysis.transcript_utils import format_summary_transcript
 
LIST_FIELDS = ("customer_concerns", "customer_requests", "agent_actions", "agreements",
               "important_details", "unresolved_issues")
 
 
def clean_list(items: List[Any], max_items: int = 8, max_chars: int = 250) -> List[str]:
    cleaned, seen = [], set()
    for item in items:
        if not isinstance(item, (str, int, float)):
            continue
        text = str(item).strip()
        text = re.sub(r"^(?:(?:SPEAKER_\d+)\s*:\s*)+", "", text)
        text = text.strip(" '\"\u2018\u2019\u201c\u201d")
        if not text or text.count("SPEAKER_") > 1:
            continue
        if len(text) > max_chars:
            text = text[:max_chars].rstrip() + "..."
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
        if len(cleaned) >= max_items:
            break
    return cleaned
 
 
def validate_summary(summary: Any, language: str, role_map: Optional[Dict[str, str]],
                     max_items: int, max_chars: int) -> Dict[str, Any]:
    if not isinstance(summary, dict):
        raise ValueError("The summary result must be a JSON object")
    missing = [f for f in SUMMARY_SCHEMA["required"] if f not in summary]
    if missing:
        raise ValueError("Summary is missing required fields: " + ", ".join(missing))
 
    summary["language"] = language
    for f in ("agent_speaker", "client_speaker", "summary", "main_topic"):
        if not isinstance(summary[f], str):
            summary[f] = str(summary[f]) if summary[f] is not None else ""
 
    # roles already found are authoritative
    if role_map:
        agents = sorted(sp for sp, r in role_map.items() if r == "agent")
        customers = sorted(sp for sp, r in role_map.items() if r == "customer")
        if agents:
            summary["agent_speaker"] = agents[0]
        if customers:
            summary["client_speaker"] = customers[0]
 
    for f in LIST_FIELDS:
        if not isinstance(summary[f], list):
            raise ValueError(f"Field '{f}' must be a JSON array")
        summary[f] = clean_list(summary[f], max_items, max_chars)
 
    if summary["resolution_status"] not in RESOLUTION_STATUSES:
        summary["resolution_status"] = "unknown"
    if summary["conversation_completion"] not in COMPLETION_STATUSES:
        summary["conversation_completion"] = "uncertain"
 
    interest = summary.get("customer_interest")
    interest = interest if isinstance(interest, dict) else {}
    level = str(interest.get("level", "")).strip().lower()
    evidence = interest.get("evidence", [])
    summary["customer_interest"] = {
        "level": level if level in INTEREST_LEVELS else "not_clear",
        "evidence": clean_list(evidence if isinstance(evidence, list) else [], max_items, max_chars),
    }
 
    entities = summary.get("entities")
    entities = entities if isinstance(entities, dict) else {}
    summary["entities"] = {
        c: clean_list(entities.get(c, []) if isinstance(entities.get(c, []), list) else [], max_items, max_chars)
        for c in ENTITY_CATEGORIES
    }
    return summary
 
 
def run_summary(client: OllamaClient, segments, language: str, role_map: Dict[str, str],
                cfg: Dict[str, Any], log) -> Dict[str, Any]:
    p5 = cfg["phase5"]
    max_items = int(p5.get("max_items_per_list", 8))
    prompt = build_summary_prompt(format_summary_transcript(segments), language, role_map, max_items)
    log.info(f"Summary prompt: {len(prompt)} chars")
    result = client.generate(prompt, SUMMARY_SCHEMA, p5.get("summary_temperatures", [0.1]), stage="summary")
    return validate_summary(result, language, role_map, max_items, int(p5.get("max_item_chars", 250)))
