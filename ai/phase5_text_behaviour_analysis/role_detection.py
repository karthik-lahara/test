"""
Speaker roles for Phase 5.
 
Priority:
    1. Manual map in config (phase5.speaker_role_map) covering all speakers
    2. Phase 4b result (Qwen) when role_status == "ok"
    3. Gemma role step (original short summary prompt)
    4. Roles from the full summary (fallback, applied later)
    5. Unknown -> agent / customer behaviour is skipped
"""
 
from typing import Any, Dict, List, Optional, Tuple
 
from phase5_text_behaviour_analysis.labels import ROLE_STEP_SCHEMA
from phase5_text_behaviour_analysis.ollama_client import OllamaClient, OllamaUnavailableError
from phase5_text_behaviour_analysis.prompts import build_role_step_prompt
from phase5_text_behaviour_analysis.transcript_utils import format_summary_transcript
 
 
def roles_from_phase4b(previous_result: Dict[str, Any], speakers: List[str]) -> Optional[Dict[str, str]]:
    if previous_result.get("role_status") != "ok":
        return None
    mapping = {r["speaker_id"]: str(r["role"]).lower() for r in previous_result.get("speaker_roles", [])}
    if set(mapping) >= set(speakers) and "agent" in mapping.values():
        return {sp: mapping[sp] for sp in speakers}
    return None
 
 
def run_role_step(client: OllamaClient, segments, language, cfg, log) -> Optional[Dict[str, str]]:
    """Returns {"agent_speaker", "client_speaker"} or None. Raises only if Ollama is unreachable."""
    if len({s["speaker"] for s in segments}) < 2:
        log.info("Only one speaker - role step skipped")
        return None
    p5 = cfg["phase5"]
    prompt = build_role_step_prompt(format_summary_transcript(segments), language,
                                    int(p5.get("max_items_per_list", 8)))
    try:
        result = client.generate(prompt, ROLE_STEP_SCHEMA, p5.get("role_temperatures", [0.1]), stage="roles",
                                 num_predict=int(p5.get("role_num_predict", 1000)))
    except OllamaUnavailableError:
        raise
    except Exception as e:
        log.warning(f"Role step failed: {e}")
        return None
    if not isinstance(result, dict):
        return None
    return {"agent_speaker": str(result.get("agent_speaker", "")).strip(),
            "client_speaker": str(result.get("client_speaker", "")).strip()}
 
 
def detect_roles(segments, candidates: List[Tuple[str, Optional[Dict[str, str]]]],
                 manual_map: Optional[Dict[str, str]] = None,
                 preset: Optional[Tuple[str, Dict[str, str]]] = None) -> Tuple[Dict[str, str], Dict[str, Any]]:
    """Returns (role_map, role_info)."""
    speakers = sorted({s["speaker"] for s in segments})
    first_speaker = segments[0]["speaker"]
 
    if manual_map and all(sp in manual_map for sp in speakers):
        return {sp: manual_map[sp] for sp in speakers}, {
            "source": "manual", "confidence": "high", "reason": "Roles supplied in phase5.speaker_role_map."}
 
    if preset:
        source, role_map = preset
        agent = next((sp for sp, r in role_map.items() if r == "agent"), None)
        return role_map, {"source": source, "confidence": "medium",
                          "first_speaker_is_agent": first_speaker == agent,
                          "reason": f"Roles taken from {source}."}
 
    for source, cand in candidates:
        if not cand or len(speakers) < 2:
            continue
        agent = str(cand.get("agent_speaker", "")).strip()
        client = str(cand.get("client_speaker", "")).strip()
        if agent in speakers and client != agent:
            role_map = {sp: ("agent" if sp == agent else "customer") for sp in speakers}
            first_is_agent = first_speaker == agent
            if first_is_agent:
                conf, reason = "medium", f"Roles identified by the {source} step; the agent also spoke first."
            else:
                conf = "low"
                reason = (f"Roles identified by the {source} step, but {first_speaker} spoke first and was not "
                          f"chosen as agent. Verify manually or set phase5.speaker_role_map.")
            return role_map, {"source": source, "confidence": conf,
                              "first_speaker_is_agent": first_is_agent, "reason": reason}
 
    return {sp: "unknown" for sp in speakers}, {
        "source": "failed", "confidence": "none",
        "reason": "Could not determine agent/customer roles. Set phase5.speaker_role_map to enable "
                  "role-wise behaviour."}
 
 
def apply_roles(segments, role_map: Dict[str, str]) -> None:
    for s in segments:
        s["role"] = role_map.get(s["speaker"], "unknown")