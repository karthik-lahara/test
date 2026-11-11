"""
Async parallel analysis of all units.
 
Up to `segment_workers` units are processed at the same time. For each unit,
pitch/energy (process pool) and Emotion2Vec (one thread, shared model) run concurrently.
The pitch process pool is created once and reused for every call.
"""
 
import asyncio
import concurrent.futures as cf
import multiprocessing
import time
from typing import Any, Dict, List, Optional, Tuple
 
import numpy as np
 
from phase6_voice_behaviour_analysis.audio_features import extract_features
from phase6_voice_behaviour_analysis.emotion import emotion_for_chunk
 
_PITCH_POOL: Optional[cf.Executor] = None
_PITCH_POOL_SIZE = 0
 
 
def _get_pitch_pool(workers: int, log) -> cf.Executor:
    global _PITCH_POOL, _PITCH_POOL_SIZE
    if _PITCH_POOL is not None and _PITCH_POOL_SIZE == workers:
        return _PITCH_POOL
    shutdown_pools()
    try:
        # "spawn" is safe even after CUDA has been initialised in the main process
        _PITCH_POOL = cf.ProcessPoolExecutor(max_workers=workers, mp_context=multiprocessing.get_context("spawn"))
    except Exception as e:
        log.warning(f"Process pool unavailable ({e}); using threads for pitch")
        _PITCH_POOL = cf.ThreadPoolExecutor(max_workers=workers)
    _PITCH_POOL_SIZE = workers
    return _PITCH_POOL
 
 
def shutdown_pools() -> None:
    global _PITCH_POOL, _PITCH_POOL_SIZE
    if _PITCH_POOL is not None:
        _PITCH_POOL.shutdown(wait=True, cancel_futures=True)
    _PITCH_POOL, _PITCH_POOL_SIZE = None, 0
 
 
async def analyse_all(units: List[Dict[str, Any]], audio: np.ndarray, sr: int, emotion_model,
                      cfg: Dict[str, Any], log) -> Tuple[List[Tuple[Dict, Tuple, float]], Dict[str, Any]]:
    """Returns ([(features, (scores, emotion, error), seconds), ...] in unit order, timing)."""
    p6 = cfg["phase6"]["parallel"]
    segment_workers = int(p6.get("segment_workers", 2))
    pitch_workers = int(p6.get("pitch_workers", segment_workers))
 
    loop = asyncio.get_running_loop()
    segment_sem = asyncio.Semaphore(segment_workers)
    pitch_pool = _get_pitch_pool(pitch_workers, log)
    emo_pool = cf.ThreadPoolExecutor(max_workers=1)      # one shared Emotion2Vec model
 
    segment_times: List[Optional[float]] = [None] * len(units)
    done = 0
    total = len(units)
 
    async def one(index: int, u: Dict[str, Any]):
        nonlocal done
        async with segment_sem:
            t0 = time.perf_counter()
            chunk = audio[int(u["start"] * sr):int(u["end"] * sr)]
 
            async def feats():
                try:
                    return await loop.run_in_executor(pitch_pool, extract_features, chunk, sr)
                except Exception:
                    return await loop.run_in_executor(None, extract_features, chunk, sr)
 
            async def emo():
                return await loop.run_in_executor(emo_pool, emotion_for_chunk, emotion_model, chunk, sr)
 
            f, e = await asyncio.gather(feats(), emo())
            elapsed = time.perf_counter() - t0
            segment_times[index] = elapsed
            done += 1
            log.debug(f"Unit {done}/{total} ({u['start']:.2f}-{u['end']:.2f}s) {elapsed:.3f}s")
            return f, e, elapsed
 
    wall_start = time.perf_counter()
    try:
        results = await asyncio.gather(*[one(i, u) for i, u in enumerate(units)])
    finally:
        emo_pool.shutdown(wait=True)
    wall = time.perf_counter() - wall_start
 
    valid = [x for x in segment_times if x is not None]
    timing = {
        "execution_mode": "async_parallel_segments",
        "segment_workers": segment_workers,
        "pitch_workers": pitch_workers,
        "emotion_workers": 1,
        "segments_processed": len(units),
        "total_segment_processing_time_sec": round(sum(valid), 3),
        "total_wall_clock_time_sec": round(wall, 3),
        "average_segment_processing_time_sec": round(float(np.mean(valid)), 3) if valid else 0.0,
        "fastest_segment_processing_time_sec": round(float(np.min(valid)), 3) if valid else 0.0,
        "slowest_segment_processing_time_sec": round(float(np.max(valid)), 3) if valid else 0.0,
        "individual_segment_times_sec": [round(x, 3) for x in valid],
    }
    return list(results), timing
