"""
Line-by-line tone check.

Every line of the chosen role(s) is judged on its own, in small batches, so a single
abusive line cannot be skipped. Each line also gets an English translation.

    impolite / abusive / threatening -> label added (rude / abusive / threatening), primary becomes the
                                        most severe one, overall becomes NEGATIVE, line flagged for review
    unclear (long enough)            -> flagged for review (text too garbled; listen to the audio)
"""

from typing import Any, Dict, List

from phase5_text_behaviour_analysis.behaviour_analyzer import derive_overall_behaviour
from phase5_text_behaviour_analysis.ollama_client import OllamaClient, OllamaUnavailableError
from phase7_overall_conversation_analysis.labels import (NEGATIVE_BEHAVIOURS, POSITIVE_BEHAVIOURS,
                                                         SEGMENT_TONE_LABELS, SEGMENT_TONE_SCHEMA, SEVERITY_WEIGHTS,
                                                         TONE_SEVERITY, TONE_TO_LABEL)
from phase7_overall_conversation_analysis.prompts import build_segment_tone_prompt


def parse_segment_tone(raw: Any, valid_ids: set) -> Dict[int, Dict[str, str]]:
    verdicts: Dict[int, Dict[str, str]] = {}
    if not isinstance(raw, dict) or not isinstance(raw.get("segments"), list):
        return verdicts
    for item in raw["segments"]:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("id"))
        except (TypeError, ValueError):
            continue
        if idx not in valid_ids or idx in verdicts:
            continue
        tone = str(item.get("tone", "")).strip().lower()
        verdicts[idx] = {"tone": tone if tone in SEGMENT_TONE_LABELS else "unclear",
                         "english": str(item.get("english", "")).strip()}
    return verdicts


def run_segment_tone(client: OllamaClient, segments, role: str, language: str, errors: List[Dict[str, str]],
                     cfg: Dict[str, Any], log) -> List[Dict[str, Any]]:
    """One entry per line of `role`. Lines the model fails to judge become "unclear" (never silently clean)."""
    p7 = cfg["phase7"]
    batch_size = int(p7.get("segment_tone_batch_size", 8))
    role_segments = [s for s in segments if s["role"] == role]
    if not role_segments:
        log.info(f"No {role} speech found - tone check skipped")
        return []

    indexed = list(enumerate(role_segments))
    results = []
    for b in range(0, len(indexed), batch_size):
        batch = indexed[b:b + batch_size]
        valid_ids = {i for i, _ in batch}
        verdicts: Dict[int, Dict[str, str]] = {}
        try:
            raw = client.generate(build_segment_tone_prompt(batch, role, language), SEGMENT_TONE_SCHEMA,
                                  p7.get("segment_tone_temperatures", [0.1]), stage=f"{role}_segment_tone")
            verdicts = parse_segment_tone(raw, valid_ids)
        except OllamaUnavailableError:
            raise
        except Exception as e:
            log.warning(f"{role} tone check failed for a batch: {e}")
            errors.append({"stage": f"{role}_segment_tone", "error": str(e)})

        for idx, seg in batch:
            v = verdicts.get(idx)
            results.append({
                "segment_id": seg.get("segment_id"), "start": seg["start"], "end": seg["end"],
                "speaker": seg["speaker"], "role": seg["role"], "text": seg["text"],
                "english": v["english"] if v else "", "tone": v["tone"] if v else "unclear",
                "source": "model" if v else "no_model_verdict",
            })

    counts: Dict[str, int] = {}
    for r in results:
        counts[r["tone"]] = counts.get(r["tone"], 0) + 1
    log.info(f"{role} line tones: {counts}")
    return results


def apply_segment_tone(result: Dict[str, Any], tone_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Severity override: impolite / abusive / threatening lines force the label, primary and NEGATIVE."""
    if not isinstance(result, dict) or not tone_results:
        return result
    negative = [t for t in tone_results if t["tone"] in TONE_TO_LABEL]
    if not negative:
        return result

    behaviours = result.get("behaviours")
    if not isinstance(behaviours, list):
        behaviours = []
        result["behaviours"] = behaviours
    existing = {str(b.get("label", "")).lower() for b in behaviours}

    for tone in TONE_SEVERITY:
        label = TONE_TO_LABEL[tone]
        first = next((t for t in negative if t["tone"] == tone), None)
        if first is None or label in existing:
            continue
        behaviours.append({
            "label": label, "severity_weight": SEVERITY_WEIGHTS.get(label, 0),
            "reason": f"Line-by-line tone check judged this line {tone}. English: {first['english']}".strip(),
            "evidence": first["text"], "evidence_verified": True, "source": "segment_tone",
        })
        existing.add(label)

    behaviours.sort(key=lambda b: SEVERITY_WEIGHTS.get(str(b.get("label", "")).lower(), 0), reverse=True)
    labels = [str(b.get("label", "")).lower() for b in behaviours]
    worst = max((l for l in labels if l in NEGATIVE_BEHAVIOURS), key=lambda l: SEVERITY_WEIGHTS.get(l, 0))

    result["primary_behaviour"] = worst
    result["primary_severity_weight"] = SEVERITY_WEIGHTS.get(worst, 0)
    result["overall_behaviour"] = derive_overall_behaviour(labels, worst)
    result["mixed_signals"] = (any(l in POSITIVE_BEHAVIOURS for l in labels)
                               and any(l in NEGATIVE_BEHAVIOURS for l in labels))
    note = (f"Line-by-line check found {len(negative)} impolite, abusive or threatening line(s); "
            f"the most severe behaviour ({worst}) is taken as primary.")
    result["reason"] = (str(result.get("reason", "")).strip() + " " + note).strip()
    return result