"""Splits long text into chunks at sentence boundaries (supports । ॥ ؟ as well as . ! ?)."""
 
import re
from typing import List
 
_SENTENCE_END = re.compile(r"(?<=[.!?।॥؟])\s+")
 
 
def split_text(text: str, max_chars: int = 1500) -> List[str]:
    if len(text) <= max_chars:
        return [text]
 
    chunks: List[str] = []
    current = ""
    for sentence in _SENTENCE_END.split(text):
        while len(sentence) > max_chars:          # one very long sentence: hard cut
            if current:
                chunks.append(current)
                current = ""
            chunks.append(sentence[:max_chars])
            sentence = sentence[max_chars:]
 
        if len(current) + len(sentence) + 1 > max_chars and current:
            chunks.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
 
    if current:
        chunks.append(current)
    return chunks
