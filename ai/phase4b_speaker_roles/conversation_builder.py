"""Turns transcript segments into a short "SPEAKER_1: ... / SPEAKER_2: ..." conversation for the LLM."""
 
from typing import Any, Dict, List
 
 
def segment_text(seg: Dict[str, Any], prefer_english: bool = True) -> str:
    """Use the English translation if there is one, otherwise the original text."""
    if prefer_english and seg.get("text_english"):
        return seg["text_english"].strip()
    return (seg.get("text") or "").strip()
 
 
def build_conversation(segments: List[Dict[str, Any]], max_turns: int = 20, max_chars: int = 3000,
                       prefer_english: bool = True) -> str:
    turns: List[List[str]] = []
    for s in sorted(segments, key=lambda x: x["start"]):
        text = segment_text(s, prefer_english)
        if not text:
            continue
        if turns and turns[-1][0] == s["speaker"]:      # same speaker again -> join into one turn
            turns[-1][1] += " " + text
        else:
            turns.append([s["speaker"], text])
    convo = "\n".join(f"{spk}: {txt}" for spk, txt in turns[:max_turns])
    return convo[:max_chars]
