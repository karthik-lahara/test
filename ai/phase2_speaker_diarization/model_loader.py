"""
Loads the pyannote diarization pipeline ONCE per process (cached).
Needs HF_TOKEN (env or config) + model terms accepted on Hugging Face.
"""
 
from typing import Any, Dict, Optional
 
from common.audio_utils import get_device
from common.exceptions import DiarizationError, ErrorCode
from common.logger import get_logger
 
_PIPELINE_CACHE: Dict[str, Any] = {}
 
 
def _from_pretrained(name: str, token: str):
    from pyannote.audio import Pipeline
    try:
        return Pipeline.from_pretrained(name, token=token)            # pyannote 4.x
    except TypeError:
        return Pipeline.from_pretrained(name, use_auth_token=token)   # pyannote 3.x
 
 
def load_diarization_pipeline(cfg: Dict[str, Any], call_id: Optional[str] = None):
    log = get_logger(__name__, call_id)
    p2 = cfg["phase2"]
    name = p2["model_name"]
    device = get_device(cfg["runtime"].get("device", "auto"))
    key = f"{name}@{device}"
    if key in _PIPELINE_CACHE:
        return _PIPELINE_CACHE[key], device
 
    token = (p2.get("hf_token") or "").strip()
    if not token:
        raise DiarizationError(ErrorCode.P2_002_HF_TOKEN_MISSING,
                               "Hugging Face token missing. Set env HF_TOKEN or phase2.hf_token")
 
    try:
        import torch
    except ImportError as e:
        raise DiarizationError(ErrorCode.P2_003_MODEL_LOAD_FAILED, "PyTorch is not installed", {"error": str(e)}) from e
 
    log.info(f"Loading diarization model '{name}' on {device} (first call only)...")
    try:
        pipeline = _from_pretrained(name, token)
    except ImportError as e:
        raise DiarizationError(ErrorCode.P2_003_MODEL_LOAD_FAILED,
                               "pyannote.audio is not installed", {"error": str(e)}) from e
    except Exception as e:
        raise DiarizationError(ErrorCode.P2_003_MODEL_LOAD_FAILED,
                               "Could not load model. Check HF_TOKEN and accept model terms on Hugging Face.",
                               {"model": name, "error": f"{type(e).__name__}: {e}"}) from e
 
    if pipeline is None:
        raise DiarizationError(ErrorCode.P2_003_MODEL_LOAD_FAILED,
                               "Model download returned nothing - accept the model terms on Hugging Face",
                               {"model": name})
 
    try:
        pipeline.to(torch.device(device))
    except Exception as e:
        log.warning(f"Could not move pipeline to {device}, staying on CPU: {e}")
        device = "cpu"
 
    _PIPELINE_CACHE[key] = pipeline
    log.info(f"Diarization model ready on {device}")
    return pipeline, device