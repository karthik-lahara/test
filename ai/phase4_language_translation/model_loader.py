"""
Loads the translation model ONCE per process (cached).
 
Model: bodhan-ai/indic-translate, loaded in 4-bit (bitsandbytes) to save GPU memory.
Needs: transformers>=5.12, accelerate, bitsandbytes, and HF_TOKEN.
"""
 
import os
from typing import Any, Dict, Optional, Tuple
 
from common.exceptions import ErrorCode, TranslationError
from common.logger import get_logger
 
_CACHE: Dict[str, Any] = {}
 
 
def load_translation_model(cfg: Dict[str, Any], call_id: Optional[str] = None) -> Tuple[Any, Any]:
    """Returns (processor, model)."""
    p4 = cfg["phase4"]
    name = p4["model_name"]
    if name in _CACHE:
        return _CACHE[name]
 
    log = get_logger(__name__, call_id)
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    token = cfg.get("phase2", {}).get("hf_token") or os.getenv("HF_TOKEN") or None
 
    try:
        import torch
        from transformers import AutoModelForImageTextToText, AutoProcessor
 
        kwargs: Dict[str, Any] = {"device_map": "auto", "token": token}
        if p4.get("load_in_4bit", True) and torch.cuda.is_available():
            from transformers import BitsAndBytesConfig
            kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.float16,
            )
 
        log.info(f"Loading translation model '{name}' (first call only)...")
        processor = AutoProcessor.from_pretrained(name, token=token)
        model = AutoModelForImageTextToText.from_pretrained(name, **kwargs).eval()
    except Exception as e:
        raise TranslationError(ErrorCode.P4_002_MODEL_LOAD_FAILED, "Could not load translation model",
                               {"model": name, "error": f"{type(e).__name__}: {e}"}) from e
 
    if torch.cuda.is_available():
        log.info(f"Translation model ready on {model.device}, "
                 f"GPU memory used {torch.cuda.memory_allocated() / 1024 ** 3:.1f} GiB")
    _CACHE[name] = (processor, model)
    return processor, model
 
 
def unload_translation_model() -> None:
    """Free GPU memory (e.g. before loading a bigger model in a later phase)."""
    import gc
    _CACHE.clear()
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass
