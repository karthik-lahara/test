"""
Cleans the raw pyannote segments ("who spoke when") before export and ASR.

    1. clip to the audio length, drop zero-length turns
    2. merge consecutive turns of the same speaker separated by <= merge_gap_sec
    3. drop turns shorter than min_segment_sec
    4. rename speakers SPEAKER_1, SPEAKER_2, ... in order of first appearance

Overlapping turns of DIFFERENT speakers are kept (Phase 6 measures overlap).
Times stay on the prepared-audio timeline, because the exporter, Phase 3 and Phase 6
cut audio with them; timeline_offset_sec is recorded in the result.
"""

from collections import OrderedDict
from typing import Any, Dict, List, Optional

from common.exceptions import DiarizationError, ErrorCode
from common.logger import get_logger


def _merge_same_speaker(segments: List[Dict[str, Any]], merge_gap: float) -> List[Dict[str, Any]]:
    """Joins a turn into the previous turn of the same speaker if no other speaker started in between."""
    merged: List[Dict[str, Any]] = []
    last_by_speaker: Dict[str, int] = {}
    for s in segments:
        idx = last_by_speaker.get(s["speaker"])
        if idx is not None and idx == len(merged) - 1 and s["start"] - merged[idx]["end"] <= merge_gap:
            merged[idx]["end"] = max(merged[idx]["end"], s["end"])
            continue
        merged.append(dict(s))
        last_by_speaker[s["speaker"]] = len(merged) - 1
    return merged


def postprocess(raw: List[Dict[str, Any]], duration: float, cfg: Dict[str, Any],
                timeline_offset_sec: float = 0.0, call_id: Optional[str] = None) -> Dict[str, Any]:
    """Returns {"segments", "num_speakers", "speakers", "speaker_label_map", "speaker_stats",
    "total_speech_sec", "timeline_offset_sec"}. Each segment: segment_id, speaker, start, end, duration."""
    log = get_logger(__name__, call_id)
    pcfg = cfg["phase2"].get("postprocess", {})
    min_seg = float(pcfg.get("min_segment_sec", 0.3))
    merge_gap = float(pcfg.get("merge_gap_sec", 0.5))
    relabel = bool(pcfg.get("relabel_by_first_appearance", True))

    try:
        segs = []
        for s in raw:
            start, end = max(0.0, float(s["start"])), min(float(duration), float(s["end"]))
            if end > start:
                segs.append({"speaker": str(s["speaker"]), "start": start, "end": end})
        segs.sort(key=lambda s: (s["start"], s["end"]))

        segs = _merge_same_speaker(segs, merge_gap)
        before = len(segs)
        segs = [s for s in segs if s["end"] - s["start"] >= min_seg]
        if before != len(segs):
            log.info(f"Dropped {before - len(segs)} segments shorter than {min_seg}s")
    except Exception as e:
        raise DiarizationError(ErrorCode.P2_006_POSTPROCESS_FAILED, "Could not post-process diarization",
                               {"error": f"{type(e).__name__}: {e}"}) from e

    if not segs:
        raise DiarizationError(ErrorCode.P2_005_NO_SPEECH_FOUND,
                               "No speech segments left after post-processing",
                               {"raw_segment_count": len(raw), "min_segment_sec": min_seg})

    label_map: "OrderedDict[str, str]" = OrderedDict()
    for s in segs:
        if s["speaker"] not in label_map:
            label_map[s["speaker"]] = f"SPEAKER_{len(label_map) + 1}" if relabel else s["speaker"]

    segments, stats = [], {}
    for i, s in enumerate(segs, start=1):
        spk = label_map[s["speaker"]]
        dur = s["end"] - s["start"]
        segments.append({"segment_id": i, "speaker": spk, "start": round(s["start"], 3),
                         "end": round(s["end"], 3), "duration": round(dur, 3)})
        st = stats.setdefault(spk, {"segment_count": 0, "total_speech_sec": 0.0})
        st["segment_count"] += 1
        st["total_speech_sec"] += dur
    for st in stats.values():
        st["total_speech_sec"] = round(st["total_speech_sec"], 3)

    speakers = list(label_map.values())
    log.info(f"Post-processed: {len(raw)} raw -> {len(segments)} segments, speakers {speakers}")
    return {
        "segments": segments,
        "num_speakers": len(speakers),
        "speakers": speakers,
        "speaker_label_map": dict(label_map),
        "speaker_stats": stats,
        "total_speech_sec": round(sum(st["total_speech_sec"] for st in stats.values()), 3),
        "timeline_offset_sec": float(timeline_offset_sec),
    }
