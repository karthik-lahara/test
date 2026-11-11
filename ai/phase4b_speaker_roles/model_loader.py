"""
Loads the role-classification LLM ONCE per process (cached).
Default model: Qwen/Qwen3-1.7B (about 4 GB GPU memory in bf16/fp16).
"""
 
import os
from typing import Any, Dict, Optional, Tuple
 
from common.exceptions import ErrorCode, RoleIdentificationError
from common.logger import get_logger
 
_CACHE: Dict[str, Any] = {}
 
 
def load_role_model(cfg: Dict[str, Any], call_id: Optional[str] = None) -> Tuple[Any, Any]:
    """Returns (tokenizer, model)."""
    name = cfg["phase4b"]["model_name"]
    if name in _CACHE:
        return _CACHE[name]
 
    log = get_logger(__name__, call_id)
    token = cfg.get("phase2", {}).get("hf_token") or os.getenv("HF_TOKEN") or None
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
 
        if torch.cuda.is_available():
            # bf16 on newer GPUs (A100, L4, RTX 30/40), fp16 on older ones (T4)
            dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        else:
            dtype = torch.float32
 
        log.info(f"Loading role model '{name}' ({dtype}) - first call only...")
        tokenizer = AutoTokenizer.from_pretrained(name, token=token)
        model = AutoModelForCausalLM.from_pretrained(name, torch_dtype=dtype, device_map="auto", token=token)
        model.eval()
    except Exception as e:
        raise RoleIdentificationError(ErrorCode.P4B_002_MODEL_LOAD_FAILED, "Could not load role model",
                                      {"model": name, "error": f"{type(e).__name__}: {e}"}) from e
 
    log.info(f"Role model ready on {model.device}")
    _CACHE[name] = (tokenizer, model)
    return tokenizer, model
