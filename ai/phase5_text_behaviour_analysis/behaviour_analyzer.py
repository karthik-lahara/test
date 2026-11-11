"""
Step 3 - agent / customer / overall behaviour.

The model always sees the WHOLE conversation (context matters) but is told which role to judge.
Evidence quotes are verified against that role's own lines only.
"""

import re
from typing import Any, Dict, List, Optional

from phase5_text_behaviour_analysis.labels import (ALL_BEHAVIOURS, BEHAVIOUR_SCHEMA, NEGATIVE_BEHAVIOURS,
                                                   POSITIVE_BEHAVIOURS)
from phase5_text_behaviour_analysis.ollama_client import OllamaClient, OllamaUnavailableError
from phase5_text_behaviour_analysis.prompts import build_behaviour_prompt
from phase5_text_behaviour_analysis.transcript_utils import format_behaviour_transcript


# ---------------- evidence verification ----------------
def normalise_text(text: str) -> str:
    return re.sub(r"\s+", "", str(text))


def strip_evidence_prefix(evidence: str) -> str:
    """Remove a copied "[12.30s - 15.10s]" timestamp and "SPEAKER_01 (customer):" label."""
    return re.sub(r"^\s*(\[[^\]]*\]\s*)?(SPEAKER_\d+\s*(\([^)]*\))?\s*:\s*)?", "", str(evidence))


def evidence_in_segments(evidence: str, segments: List[Dict[str, Any]]) -> bool:
    needle = normalise_text(strip_evidence_prefix(evidence))
    if not needle:
        return False
    return needle in normalise_text(" ".join(s["text"] for s in segments))


def find_evidence_segments(evidence: str, segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    needle = normalise_text(strip_evidence_prefix(evidence))
    if not needle:
        return []
    return [s for s in segments if needle in normalise_text(s.get("text", ""))]


# ---------------- validation ----------------
def derive_overall_behaviour(labels: List[str], primary: str) -> str:
    """POSITIVE / NEGATIVE / NEUTRAL - the primary behaviour decides first."""
    if primary in NEGATIVE_BEHAVIOURS:
        return "NEGATIVE"
    if primary in POSITIVE_BEHAVIOURS:
        return "POSITIVE"
    pos = sum(1 for l in labels if l in POSITIVE_BEHAVIOURS)
    neg = sum(1 for l in labels if l in NEGATIVE_BEHAVIOURS)
    if neg > pos:
        return "NEGATIVE"
    if pos > neg:
        return "POSITIVE"
    return "NEUTRAL"


def validate_behaviour_result(result: Any, evidence_segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(result, dict):
        raise ValueError("Behaviour analysis did not return a JSON object")
    behaviours = result.get("behaviours", [])
    if not isinstance(behaviours, list):
        raise ValueError("'behaviours' must be a list")

    valid, seen = [], set()
    for item in behaviours:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "")).strip().lower()
        if label not in ALL_BEHAVIOURS or label in seen:
            continue
        seen.add(label)
        evidence = str(item.get("evidence", "")).strip()
        valid.append({"label": label, "reason": str(item.get("reason", "")), "evidence": evidence,
                      "evidence_verified": evidence_in_segments(evidence, evidence_segments)})

    labels = [v["label"] for v in valid]
    primary = str(result.get("primary_behaviour", "neutral")).strip().lower()
    if primary not in labels:
        primary = labels[0] if labels else "neutral"

    return {
        "behaviours": valid,
        "primary_behaviour": primary,
        "overall_behaviour": derive_overall_behaviour(labels, primary),
        "mixed_signals": any(l in POSITIVE_BEHAVIOURS for l in labels) and
                         any(l in NEGATIVE_BEHAVIOURS for l in labels),
        "reason": str(result.get("reason", "")),
    }


def failed_behaviour(error: Exception) -> Dict[str, Any]:
    return {"error": str(error), "behaviours": [], "primary_behaviour": "neutral",
            "overall_behaviour": "NEUTRAL", "reason": "Analysis failed; no conclusion made."}


# ---------------- run ----------------
def run_behaviour(client: OllamaClient, segments, scope: str, stage: str, cfg: Dict[str, Any],
                  target_role: Optional[str] = None) -> Dict[str, Any]:
    prompt = build_behaviour_prompt(format_behaviour_transcript(segments), scope)
    result = client.generate(prompt, BEHAVIOUR_SCHEMA, cfg["phase5"].get("behaviour_temperatures", [0.1]),
                             stage=stage)
    evidence_segments = [s for s in segments if s["role"] == target_role] if target_role else segments
    return validate_behaviour_result(result, evidence_segments)


def run_role_behaviour(client: OllamaClient, segments, role: str, errors: List[Dict[str, str]],
                       cfg: Dict[str, Any], log) -> Dict[str, Any]:
    role_segments = [s for s in segments if s["role"] == role]
    if not role_segments:
        log.info(f"No {role} speech found - {role} behaviour skipped")
        return {"role": role, "speakers": [], "segment_count": 0, "behaviours": [],
                "primary_behaviour": "neutral", "overall_behaviour": "NEUTRAL",
                "reason": f"No {role} speech found or roles unknown."}

    speakers = sorted({s["speaker"] for s in role_segments})
    scope = (f"Evaluate ONLY the {role.upper()} (speaker: {', '.join(speakers)}). "
             f"Lines from the other party are context only. Do not attribute the other party's behaviour "
             f"to the {role}. Every evidence quote must come from a {role} line.")
    try:
        result = run_behaviour(client, segments, scope, f"{role}_behaviour", cfg, target_role=role)
    except OllamaUnavailableError:
        raise
    except Exception as e:
        log.warning(f"{role} behaviour analysis failed: {e}")
        errors.append({"stage": f"{role}_behaviour", "error": str(e)})
        result = failed_behaviour(e)

    return {"role": role, "speakers": speakers, "segment_count": len(role_segments),
            "start": min(s["start"] for s in role_segments), "end": max(s["end"] for s in role_segments),
            **result}


def run_overall_behaviour(client: OllamaClient, segments, errors: List[Dict[str, str]],
                          cfg: Dict[str, Any], log) -> Dict[str, Any]:
    scope = ("Evaluate the ENTIRE conversation across all speakers. "
             "Report the behaviours that characterise the interaction as a whole.")
    try:
        return run_behaviour(client, segments, scope, "overall_behaviour", cfg, target_role=None)
    except OllamaUnavailableError:
        raise
    except Exception as e:
        log.warning(f"Overall behaviour analysis failed: {e}")
        errors.append({"stage": "overall_behaviour", "error": str(e)})
        return failed_behaviour(e)