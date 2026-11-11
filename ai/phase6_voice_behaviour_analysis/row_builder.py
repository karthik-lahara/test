"""
Combines the per-unit voice results into rows, then compares each speaker with their own baseline.

assemble_rows(units, results, pauses) -> (rows, errors)
    results[i] is (features, (emotion_scores, emotion, error), seconds) from parallel_runner.analyse_all.
    Units whose emotion model call failed are left out (reported in errors); pitch errors only warn.

apply_speaker_baselines(rows, cfg, log) -> baselines
    Baseline = mean pitch / energy of each speaker's first `baseline_units` rows.
    Sets voice_level_change and behaviour_label (emotion.segment_label) on every row.
"""

from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from phase6_voice_behaviour_analysis.audio_features import pause_stats
from phase6_voice_behaviour_analysis.emotion import segment_label, valence_from_scores


def _turn_taking(units: List[Dict[str, Any]], i: int) -> Tuple[Optional[float], float]:
    """gap_before_sec: silence since the latest earlier speech (None for the first unit, 0 if overlapping).
    overlap_sec: time this unit overlaps units of other speakers."""
    u = units[i]
    earlier_ends = [v["end"] for j, v in enumerate(units) if j != i and v["start"] < u["start"]]
    gap = round(max(0.0, u["start"] - max(earlier_ends)), 3) if earlier_ends else None
    overlap = sum(max(0.0, min(u["end"], v["end"]) - max(u["start"], v["start"]))
                  for v in units if v["speaker"] != u["speaker"])
    return gap, round(overlap, 3)


def assemble_rows(units: List[Dict[str, Any]], results: List[Tuple[Dict, Tuple, float]],
                  pauses: List[Tuple[float, float]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    rows: List[Dict[str, Any]] = []
    errors: List[str] = []
    for i, (u, res) in enumerate(zip(units, results), start=1):
        feats, (scores, emotion, emo_error), seconds = res
        where = f"unit {i} {u['speaker']} {u['start']:.2f}-{u['end']:.2f}s"
        if emo_error:
            errors.append(f"{where}: emotion failed: {emo_error}")
            continue
        if feats.get("pitch_error"):
            errors.append(f"{where}: pitch unavailable: {feats['pitch_error']}")

        gap, overlap = _turn_taking(units, i - 1)
        rows.append({
            "unit_id": i,
            "start": float(u["start"]),
            "end": float(u["end"]),
            "duration": round(float(u["end"] - u["start"]), 3),
            "speaker": u["speaker"],
            "role": u.get("role", "unknown"),
            "emotion": emotion,
            "emotion_confidence": float(scores.get(emotion, 0.0)),
            "emotion_scores": scores,
            "valence": valence_from_scores(scores),
            **{k: v for k, v in feats.items() if k != "pitch_error"},
            **pause_stats(pauses, u["start"], u["end"]),
            "gap_before_sec": gap,
            "overlap_sec": overlap,
            "processing_time_sec": round(float(seconds), 3),
        })
    if len(results) != len(units):
        errors.append(f"result count {len(results)} != unit count {len(units)}")
    return rows, errors


def _voice_level_change(pitch_rise: Optional[bool], energy_rise: Optional[bool]) -> str:
    if pitch_rise is None and energy_rise is None:
        return "not_available"
    if pitch_rise and energy_rise:
        return "raised_pitch_and_energy"
    if pitch_rise:
        return "raised_pitch"
    if energy_rise:
        return "raised_energy"
    return "normal"


def apply_speaker_baselines(rows: List[Dict[str, Any]], cfg: Dict[str, Any], log=None) -> Dict[str, Any]:
    p6 = cfg["phase6"]
    n = max(1, int(p6.get("baseline_units", 3)))
    pitch_ratio = float(p6.get("pitch_rise_ratio", 1.15))
    energy_ratio = float(p6.get("energy_rise_ratio", 1.25))
    min_conf = float(p6.get("min_emotion_conf", 0.30))

    baselines: Dict[str, Any] = {}
    for spk in sorted({r["speaker"] for r in rows}):
        own = sorted((r for r in rows if r["speaker"] == spk), key=lambda r: r["start"])[:n]
        pitches = [r["pitch_mean_hz"] for r in own if r.get("pitch_mean_hz")]
        energies = [r["energy_mean"] for r in own if r.get("energy_mean")]
        baselines[spk] = {
            "role": own[0].get("role") if own else None,
            "units_used": len(own),
            "pitch_mean_hz": round(float(np.mean(pitches)), 2) if pitches else None,
            "energy_mean": round(float(np.mean(energies)), 6) if energies else None,
        }

    for r in rows:
        b = baselines[r["speaker"]]
        pitch_rise = (r["pitch_mean_hz"] > b["pitch_mean_hz"] * pitch_ratio
                      if r.get("pitch_mean_hz") and b["pitch_mean_hz"] else None)
        energy_rise = (r["energy_mean"] > b["energy_mean"] * energy_ratio
                       if r.get("energy_mean") and b["energy_mean"] else None)
        r["voice_level_change"] = _voice_level_change(pitch_rise, energy_rise)
        r["behaviour_label"] = segment_label(r["emotion"], r["emotion_confidence"],
                                             bool(pitch_rise), bool(energy_rise), min_conf)

    if log:
        log.info(f"Speaker baselines: {baselines}")
    return baselines
