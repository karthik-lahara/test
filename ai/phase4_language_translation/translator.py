"""
Translator - turns one piece of text into English.
 
translate_chunk() -> one model.generate() call
translate_text()  -> skips empty / number-only text, splits long text, caches repeats
"""
 
import re
import time
from typing import Any, Dict, Optional
 
from common.logger import get_logger
from phase4_language_translation.model_loader import load_translation_model
from phase4_language_translation.text_splitter import split_text
 
PROMPT = (
    "Translate the following transcription into {target}. "
    "Preserve the original meaning and all information. "
    "Write proper names using their standard English spellings. "
    "Convert clearly spoken numbers into numerical digits. "
    "Do not guess unclear words, names, or numbers. "
    "Do not add or omit information.\n\n"
    "{text}"
)
 
_HAS_LETTER = re.compile(r"[^\W\d_]")
 
 
class Translator:
    def __init__(self, cfg: Dict[str, Any], call_id: Optional[str] = None):
        self.cfg = cfg["phase4"]
        self.call_id = call_id
        self.log = get_logger(__name__, call_id)
        self.processor, self.model = load_translation_model(cfg, call_id)
        self.target = self.cfg.get("target_language", "English")
        self._cache: Dict[str, str] = {}
        self.count = 0
 
    def translate_chunk(self, text: str) -> str:
        import torch
 
        messages = [{"role": "user", "content": PROMPT.format(target=self.target, text=text)}]
        inputs = self.processor.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=True,
            return_dict=True, return_tensors="pt",
        ).to(self.model.device)
 
        with torch.inference_mode():
            output = self.model.generate(
                **inputs,
                max_new_tokens=min(int(self.cfg.get("max_new_tokens", 2048)), int(len(text) * 1.5) + 32),
                num_beams=int(self.cfg.get("num_beams", 3)),
                do_sample=False,
                use_cache=True,
            )
        completion = output[0, inputs["input_ids"].shape[-1]:]
        return self.processor.decode(completion, skip_special_tokens=True).strip()
 
    def translate_text(self, text: str) -> str:
        if not text or not text.strip():
            return text
        if not _HAS_LETTER.search(text):          # only digits / symbols -> keep as is
            return text
        if text in self._cache:
            return self._cache[text]
 
        t0 = time.perf_counter()
        chunks = split_text(text.strip(), int(self.cfg.get("max_chars", 1500)))
        result = " ".join(self.translate_chunk(c) for c in chunks)
        self._cache[text] = result
        self.count += 1
        self.log.debug(f"Translated {len(text)} chars in {time.perf_counter() - t0:.1f}s")
        return result