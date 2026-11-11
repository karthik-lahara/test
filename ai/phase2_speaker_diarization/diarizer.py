"""Runs pyannote on the prepared audio and returns raw segments."""
 
from typing import Any, Dict, List, Optional
 
import numpy as np
 
from common.exceptions import DiarizationError, ErrorCode
from common.logger import get_logger
 
 
def _speaker_kwargs(p2):
    if p2.get("num_speakers"):
        return {"num_speakers": int(p2["num_speakers"])}
    kwargs = {}
    if p2.get("min_speakers"):
        kwargs["min_speakers"] = int(p2["min_speakers"])
    if p2.get("max_speakers"):
        kwargs["max_speakers"] = int(p2["max_speakers"])
    return kwargs
 
 
def _segments_from_output(output) -> List[Dict[str, Any]]:
    """
    Reads speaker turns from whatever the installed pyannote returns:
      3.x            -> Annotation (has itertracks)
      4.x            -> object with .speaker_diarization (an Annotation)
      some 4.x / core 6 builds -> .speaker_diarization (or the output) is an iterable of
                        (turn, speaker) or (turn, track, speaker) tuples
    """
    annotation = getattr(output, "speaker_diarization", output)
    if hasattr(annotation, "itertracks"):
        items = annotation.itertracks(yield_label=True)
    else:
        items = iter(annotation)

    segments = []
    for item in items:
        if not isinstance(item, tuple) or len(item) not in (2, 3):
            raise TypeError(f"Unexpected diarization item {type(item).__name__}: {item!r}")
        turn, label = item[0], item[-1]
        segments.append({"speaker": str(label), "start": float(turn.start), "end": float(turn.end)})
    return segments


def run_diarization(pipeline, audio: np.ndarray, sr: int, cfg: Dict[str, Any],
                    call_id: Optional[str] = None) -> List[Dict[str, Any]]:
    import torch
 
    log = get_logger(__name__, call_id)
    kwargs = _speaker_kwargs(cfg["phase2"])
    log.info(f"Running diarization on {len(audio) / sr:.1f}s audio, speaker hints={kwargs or 'auto'}")
 
    waveform = torch.from_numpy(np.ascontiguousarray(audio, dtype=np.float32)).unsqueeze(0)
    try:
        output = pipeline({"waveform": waveform, "sample_rate": sr}, **kwargs)
    except torch.cuda.OutOfMemoryError as e:
        torch.cuda.empty_cache()
        raise DiarizationError(ErrorCode.P2_008_GPU_OUT_OF_MEMORY, "GPU ran out of memory during diarization",
                               {"duration_sec": round(len(audio) / sr, 2)}) from e
    except Exception as e:
        raise DiarizationError(ErrorCode.P2_004_DIARIZATION_FAILED, "Diarization pipeline failed",
                               {"error": f"{type(e).__name__}: {e}"}) from e
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
 
    segments = _segments_from_output(output)
    segments.sort(key=lambda s: (s["start"], s["end"]))
 
    if not segments:
        raise DiarizationError(ErrorCode.P2_005_NO_SPEECH_FOUND, "Diarization found no speech in the audio")
 
    log.info(f"Raw diarization: {len(segments)} segments, {len({s['speaker'] for s in segments})} speakers")
    return segments
