"""
All LLM prompts for Phase 5 (copied from the original conversation-analysis script).
"""
 
from typing import Dict, Optional
 
from phase5_text_behaviour_analysis.labels import ALL_BEHAVIOURS
 
 
def build_role_step_prompt(transcript: str, language: str, max_items: int = 8) -> str:
    return f"""...your build_role_step_prompt text (original lines 779-856)..."""
 
 
def build_roles_block(role_map: Dict[str, str]) -> str:
    """Tells the summary model the roles that are already known."""
    agents = sorted(sp for sp, r in role_map.items() if r == "agent")
    customers = sorted(sp for sp, r in role_map.items() if r == "customer")
    if not agents or not customers:
        return ""
    return f"""KNOWN SPEAKER ROLES (already determined - use them exactly, do not swap them):
- AGENT: {', '.join(agents)}
- CUSTOMER: {', '.join(customers)}
"agent_speaker" and "client_speaker" must be exactly these speaker IDs.
"""
 
 
def build_summary_prompt(transcript: str, language: str, role_map: Optional[Dict[str, str]] = None,
                         max_items: int = 8) -> str:
    roles_block = build_roles_block(role_map or {})
    return f"""...your build_summary_prompt text (original lines 1019-1536)..."""
 
 
def build_behaviour_prompt(transcript: str, scope: str) -> str:
    allowed = ", ".join(ALL_BEHAVIOURS)
    return f"""...your build_behaviour_prompt text (original lines 1717-1804)..."""