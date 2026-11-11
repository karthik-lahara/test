"""
Indic speech-to-text with AI4Bharat IndicConformer, run in a process pool.
 
- Each worker process loads its own model copy once (initializer).
- The pool is created once and REUSED for every call (no model reload per call).
- Uses the "spawn" start method so CUDA works inside the workers.
 
Accept the model terms on Hugging Face (same account as HF_TOKEN):
https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual
"""
 
import multiprocessing as mp
import os
from concurrent.futures import ProcessPoolExecutor
from typing import Any, Dict, Optional
 
_WORKER_MODEL = None
_WORKER_DECODING = "ctc"
 
_POOL: Optional[ProcessPoolExecutor] = None
_POOL_KEY: Optional[str] = None
 
 
# ------------------------------------------------------------------
# Functions that run INSIDE the worker processes
# ------------------------------------------------------------------
def _init_worker(model_name: str, decoding: str, hf_token: str, workers: int) -> None:
    global _WORKER_MODEL, _WORKER_DECODING
    import torch
    from transformers import AutoModel
 
    torch.set_num_threads(max(1, (os.cpu_count() or 1) // max(1, workers)))
    print(f"[indic worker {os.getpid()}] loading {model_name} ...", flush=True)
    _WORKER_MODEL = AutoModel.from_pretrained(model_name, trust_remote_code=True, token=hf_token or None)
    _WORKER_DECODING = decoding
    print(f"[indic worker {os.getpid()}] model ready", flush=True)
 
 
def _worker_transcribe(wav_path: str, lang: str) -> str:
    """Transcribe one 16 kHz mono wav clip."""
    import soundfile as sf
    import torch
 
    if _WORKER_MODEL is None:
        raise RuntimeError("Indic model is not initialised in this worker")
 
    audio, sr = sf.read(wav_path, dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != 16000:
        import soxr
        audio = soxr.resample(audio, sr, 16000)
    wav = torch.from_numpy(audio).float().unsqueeze(0)      # [1, T]
    with torch.no_grad():
        text = _WORKER_MODEL(wav, lang, _WORKER_DECODING)
    return str(text).strip()
 
 
# ------------------------------------------------------------------
# Pool management (main process)
# ------------------------------------------------------------------
def get_indic_pool(cfg: Dict[str, Any]) -> ProcessPoolExecutor:
    """Create the worker pool on first use, then reuse it."""
    global _POOL, _POOL_KEY
    icfg = cfg["phase3"]["indic"]
    workers = max(1, int(os.getenv("INDIC_WORKERS", icfg.get("workers", 1))))
    key = f"{icfg['model_name']}|{icfg.get('decoding', 'ctc')}|{workers}"
 
    if _POOL is not None and _POOL_KEY == key:
        return _POOL
    shutdown_indic_pool()
 
    hf_token = cfg.get("phase2", {}).get("hf_token") or os.getenv("HF_TOKEN", "")
    _POOL = ProcessPoolExecutor(
        max_workers=workers,
        mp_context=mp.get_context("spawn"),
        initializer=_init_worker,
        initargs=(icfg["model_name"], icfg.get("decoding", "ctc"), hf_token, workers),
    )
    _POOL_KEY = key
    return _POOL
 
 
def shutdown_indic_pool() -> None:
    global _POOL, _POOL_KEY
    if _POOL is not None:
        _POOL.shutdown(wait=True, cancel_futures=True)
    _POOL, _POOL_KEY = None, None 