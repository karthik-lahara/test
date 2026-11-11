"""
Phase 7 prompts (copied from the newer conversation-analysis script).
"""
 
from typing import Dict, List, Optional, Tuple
 
from phase5_text_behaviour_analysis.prompts import build_roles_block, build_role_step_prompt  # noqa: F401
from phase7_overall_conversation_analysis.labels import ALL_BEHAVIOURS
 
 
def build_summary_prompt(transcript: str, language: str, role_map: Optional[Dict[str, str]] = None,
                         max_items: int = 8) -> str:
    roles_block = build_roles_block(role_map or {})
    return f"""...your build_summary_prompt text (original lines 1063-1623, with FOLLOW-UP section)..."""
 
 
def build_behaviour_prompt(transcript: str, scope: str) -> str:
    allowed = ", ".join(ALL_BEHAVIOURS)
    return f"""...your build_behaviour_prompt text (original lines 1815-1956, with FIXED SEVERITY WEIGHTAGE)..."""
 
 
def build_segment_tone_prompt(lines: List[Tuple[int, dict]], role: str, language: str) -> str:
    """lines = list of (id, segment)."""
    body = "\n".join(f"{idx}: {seg['text']}" for idx, seg in lines)
    return f"""...your build_segment_tone_prompt text (original lines 2444-2470)..."""
