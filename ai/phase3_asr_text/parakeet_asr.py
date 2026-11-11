"""
English speech-to-text with NVIDIA Parakeet, through an ASYNC SUBPROCESS.
 
All segment clips of a call are sent in ONE subprocess run, so the model
loads once per call instead of once per segment.
 
The subprocess runs in a separate Parakeet venv (phase3.parakeet.python_executable
in config.yaml, e.g. ".venv_parakeet/bin/python"). A relative path is resolved
from the project folder, so it works no matter where the command is started.
"""
 
import asyncio
import json
import os
import sys
import tempfile
from typing import Any, Dict, List, Optional
 
from common.exceptions import ASRError, ErrorCode
from common.logger import get_logger
 
WORKER_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parakeet_worker.py")
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
 
 
async def transcribe_with_parakeet(wav_paths: List[str], cfg: Dict[str, Any],
                                   call_id: Optional[str] = None) -> List[str]:
    """Returns one text per wav path, same order."""
    log = get_logger(__name__, call_id)
    pcfg = cfg["phase3"]["parakeet"]
 
    python = pcfg.get("python_executable") or sys.executable
    if not os.path.isabs(python) and os.sep in python:      # e.g. ".venv_parakeet/bin/python"
        python = os.path.join(PROJECT_ROOT, python)          # resolve from the project folder, not the cwd
    if not os.path.isfile(python):
        raise ASRError(ErrorCode.P3_005_PARAKEET_FAILED, "Parakeet python not found - create .venv_parakeet",
                       {"python_executable": python})
 
    with tempfile.TemporaryDirectory() as tmp:
        in_json, out_json = os.path.join(tmp, "in.json"), os.path.join(tmp, "out.json")
        with open(in_json, "w", encoding="utf-8") as f:
            json.dump(wav_paths, f)
 
        cmd = [python, WORKER_SCRIPT, "--model", pcfg["model_name"], "--inputs", in_json,
               "--output", out_json, "--batch-size", str(pcfg.get("batch_size", 8))]
        log.info(f"Starting Parakeet subprocess for {len(wav_paths)} segments ({python})")
 
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=pcfg.get("timeout_sec", 1800))
        except asyncio.TimeoutError as e:
            proc.kill()
            raise ASRError(ErrorCode.P3_005_PARAKEET_FAILED, "Parakeet subprocess timed out") from e
 
        if proc.returncode != 0 or not os.path.isfile(out_json):
            tail = stderr.decode("utf-8", errors="ignore")[-2000:]
            raise ASRError(ErrorCode.P3_005_PARAKEET_FAILED, "Parakeet subprocess failed",
                           {"returncode": proc.returncode, "stderr_tail": tail})
 
        with open(out_json, encoding="utf-8") as f:
            texts = json.load(f)
 
    if len(texts) != len(wav_paths):
        raise ASRError(ErrorCode.P3_005_PARAKEET_FAILED, "Parakeet returned a different number of results",
                       {"expected": len(wav_paths), "got": len(texts)})
    return texts
