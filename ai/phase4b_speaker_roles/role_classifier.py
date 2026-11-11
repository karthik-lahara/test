"""
Decides which speaker is the AGENT and which the CUSTOMER(s) with a small local LLM (Qwen3, see model_loader).

identify_roles() returns ({speaker_id: "AGENT" | "CUSTOMER" | "UNKNOWN"}, raw_model_output).
A valid answer has exactly one AGENT; every other speaker is CUSTOMER.
Anything else (no JSON, unknown labels, zero or several agents) -> every speaker UNKNOWN,
which identify_roles.py reports as role_status "role_uncertain" (not a pipeline failure).
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from common.logger import get_logger
from phase4b_speaker_roles.model_loader import load_role_model

VALID_ROLES = {"AGENT", "CUSTOMER"}

SYSTEM_PROMPT = (
    "You label the speakers of a recorded phone call between a company employee (AGENT) and a "
    "CUSTOMER. The AGENT represents the company: greets with the company name, asks for account "
    "details, offers help, explains policies or solutions. The CUSTOMER called about their own "
    "problem, order, payment or request. Answer with JSON only."
)


def build_prompt(conversation: str, speaker_ids: List[str]) -> List[Dict[str, str]]:
    example = ", ".join(f'"{s}": "AGENT or CUSTOMER"' for s in speaker_ids)
    user = (f"Conversation:\n{conversation}\n\n"
            f"Speakers: {', '.join(speaker_ids)}. Exactly one speaker is the AGENT; the others are CUSTOMER.\n"
            f"Reply with only this JSON object: {{{example}}}")
    return [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]


def _strip_thinking(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def parse_roles(raw_output: str, speaker_ids: List[str]) -> Dict[str, str]:
    """Reads {speaker: role} from the model text (JSON first, then 'SPEAKER_1: AGENT' lines)."""
    text = _strip_thinking(raw_output)
    found: Dict[str, str] = {}

    for match in re.finditer(r"\{.*?\}", text, flags=re.DOTALL):
        try:
            obj = json.loads(match.group(0))
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            found = {str(k).strip(): str(v).strip().upper() for k, v in obj.items()}
            break

    if not found:
        for spk in speaker_ids:
            m = re.search(rf"{re.escape(spk)}\W{{0,5}}(AGENT|CUSTOMER)", text, flags=re.IGNORECASE)
            if m:
                found[spk] = m.group(1).upper()

    return {spk: found.get(spk, "UNKNOWN") for spk in speaker_ids}


def validate_roles(roles: Dict[str, str], speaker_ids: List[str]) -> Dict[str, str]:
    """Exactly one AGENT -> others CUSTOMER. Otherwise all UNKNOWN."""
    agents = [s for s in speaker_ids if roles.get(s) == "AGENT"]
    bad = [s for s in speaker_ids if roles.get(s) not in VALID_ROLES | {"UNKNOWN"}]
    if len(agents) != 1 or bad:
        return {s: "UNKNOWN" for s in speaker_ids}
    return {s: ("AGENT" if s == agents[0] else "CUSTOMER") for s in speaker_ids}


def _generate(messages: List[Dict[str, str]], cfg: Dict[str, Any], call_id: Optional[str]) -> str:
    import torch

    tokenizer, model = load_role_model(cfg, call_id)
    try:   # Qwen3: switch off the <think> block so the answer is just the JSON
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True,
                                               enable_thinking=False)
    except TypeError:
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=int(cfg["phase4b"].get("max_new_tokens", 160)),
                             do_sample=False, pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id)
    return tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()


def identify_roles(conversation: str, speaker_ids: List[str], cfg: Dict[str, Any],
                   call_id: Optional[str] = None) -> Tuple[Dict[str, str], str]:
    log = get_logger(__name__, call_id)
    raw_output = _generate(build_prompt(conversation, speaker_ids), cfg, call_id)
    parsed = parse_roles(raw_output, speaker_ids)
    roles = validate_roles(parsed, speaker_ids)
    if "UNKNOWN" in roles.values():
        log.warning(f"Role model answer not usable ({parsed}); raw: {raw_output[:200]!r}")
    return roles, raw_output
