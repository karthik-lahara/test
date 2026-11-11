"""
Offline tests (no GPU, no model downloads) for the P2 -> P4b -> P6 data flow:
    phase2 postprocessor -> phase4b role classifier/orchestrator -> phase6 row builder + report.

    python -m pytest tests -q
"""

import copy

import pytest

from common.config_loader import load_config
from common.exceptions import DiarizationError, ErrorCode
from phase2_speaker_diarization.postprocessor import postprocess
from phase4b_speaker_roles import role_classifier
from phase4b_speaker_roles.identify_roles import run_phase4b
from phase4b_speaker_roles.role_classifier import parse_roles, validate_roles
from phase6_voice_behaviour_analysis.report import build_role_report, build_timeline
from phase6_voice_behaviour_analysis.role_resolver import resolve_roles
from phase6_voice_behaviour_analysis.row_builder import apply_speaker_baselines, assemble_rows
from phase6_voice_behaviour_analysis.units import load_segments, make_units


@pytest.fixture
def cfg(tmp_path):
    c = copy.deepcopy(load_config())
    for key in c["paths"]:
        c["paths"][key] = str(tmp_path / key)
    return c


RAW = [  # pyannote-style raw output: labels SPEAKER_00 / SPEAKER_01
    {"speaker": "SPEAKER_01", "start": 0.0, "end": 3.0},
    {"speaker": "SPEAKER_01", "start": 3.2, "end": 5.0},     # gap 0.2 -> merged with previous
    {"speaker": "SPEAKER_00", "start": 5.5, "end": 12.0},
    {"speaker": "SPEAKER_01", "start": 11.5, "end": 11.6},   # 0.1 s -> dropped
    {"speaker": "SPEAKER_01", "start": 12.5, "end": 16.0},
    {"speaker": "SPEAKER_00", "start": 15.8, "end": 25.0},   # runs past audio end -> clipped
]


# ---------------- Phase 2 ----------------
def test_postprocess_merges_drops_relabels_and_clips(cfg):
    out = postprocess(RAW, duration=20.0, cfg=cfg)
    segs = out["segments"]
    assert [s["speaker"] for s in segs] == ["SPEAKER_1", "SPEAKER_2", "SPEAKER_1", "SPEAKER_2"]
    assert out["speaker_label_map"] == {"SPEAKER_01": "SPEAKER_1", "SPEAKER_00": "SPEAKER_2"}
    assert (segs[0]["start"], segs[0]["end"]) == (0.0, 5.0)
    assert segs[-1]["end"] == 20.0
    assert [s["segment_id"] for s in segs] == [1, 2, 3, 4]
    assert all(s["duration"] == round(s["end"] - s["start"], 3) for s in segs)
    assert out["num_speakers"] == 2 and out["speakers"] == ["SPEAKER_1", "SPEAKER_2"]


def test_postprocess_does_not_merge_across_other_speaker(cfg):
    raw = [{"speaker": "A", "start": 0, "end": 2}, {"speaker": "B", "start": 2.1, "end": 2.3},
           {"speaker": "A", "start": 2.4, "end": 4}]
    cfg["phase2"]["postprocess"]["min_segment_sec"] = 0.1
    segs = postprocess(raw, 10.0, cfg)["segments"]
    assert len(segs) == 3


def test_postprocess_no_speech_left_raises(cfg):
    with pytest.raises(DiarizationError) as e:
        postprocess([{"speaker": "A", "start": 1.0, "end": 1.1}], 10.0, cfg)
    assert e.value.code == ErrorCode.P2_005_NO_SPEECH_FOUND


# ---------------- Phase 4b parsing ----------------
SPK = ["SPEAKER_1", "SPEAKER_2"]


@pytest.mark.parametrize("raw, expected", [
    ('{"SPEAKER_1": "AGENT", "SPEAKER_2": "CUSTOMER"}', {"SPEAKER_1": "AGENT", "SPEAKER_2": "CUSTOMER"}),
    ('<think>hmm</think>```json\n{"SPEAKER_1": "customer", "SPEAKER_2": "agent"}\n```',
     {"SPEAKER_1": "CUSTOMER", "SPEAKER_2": "AGENT"}),
    ("SPEAKER_1: AGENT\nSPEAKER_2 - Customer", {"SPEAKER_1": "AGENT", "SPEAKER_2": "CUSTOMER"}),
    ('{"SPEAKER_1": "AGENT"}', {"SPEAKER_1": "AGENT", "SPEAKER_2": "CUSTOMER"}),        # missing -> customer
    ('{"SPEAKER_1": "AGENT", "SPEAKER_2": "AGENT"}', {"SPEAKER_1": "UNKNOWN", "SPEAKER_2": "UNKNOWN"}),
    ('{"SPEAKER_1": "MANAGER", "SPEAKER_2": "AGENT"}', {"SPEAKER_1": "UNKNOWN", "SPEAKER_2": "UNKNOWN"}),
    ("I am not sure.", {"SPEAKER_1": "UNKNOWN", "SPEAKER_2": "UNKNOWN"}),
])
def test_parse_and_validate_roles(raw, expected):
    assert validate_roles(parse_roles(raw, SPK), SPK) == expected


def test_build_prompt_lists_every_speaker():
    msgs = role_classifier.build_prompt("SPEAKER_1: hi", SPK)
    assert all(s in msgs[-1]["content"] for s in SPK)


# ---------------- P2 -> P4b -> P6 data flow ----------------
def _phase4_like(cfg):
    p2 = postprocess(RAW, 20.0, cfg)
    texts = {1: "Hello, thanks for calling Acme support, may I have your account number?",
             2: "Yes, my order never arrived and I am really upset.",
             3: "I am sorry, let me check that for you.",
             4: "This is the third time I am calling!"}
    return {"segments": [{**s, "text": texts[s["segment_id"]], "text_english": texts[s["segment_id"]]}
                         for s in p2["segments"]]}


def _fake_results(units):
    """Stand-in for parallel_runner.analyse_all: customer's last unit is angry and louder."""
    out = []
    for u in units:
        loud = u["role"] == "customer" and u["start"] >= 15.0       # unit 15.8-20.0 s
        feats = {"pitch_mean_hz": 260.0 if loud else 200.0, "energy_mean": 0.2 if loud else 0.1}
        emo = ({"angry": 0.8, "neutral": 0.2}, "angry") if loud else ({"neutral": 0.9, "angry": 0.1}, "neutral")
        out.append((feats, (emo[0], emo[1], None), 0.01))
    return out


def test_p2_p4b_p6_flow(cfg, monkeypatch):
    monkeypatch.setattr(role_classifier, "identify_roles",
                        lambda conv, spk, c, cid=None: ({"SPEAKER_1": "AGENT", "SPEAKER_2": "CUSTOMER"}, "{}"))
    p4b = run_phase4b(_phase4_like(cfg), "TEST", cfg)
    assert p4b["role_status"] == "ok"
    assert {s["role"] for s in p4b["segments"]} == {"AGENT", "CUSTOMER"}

    # Phase 6 receives the Phase 4b result exactly as run_pipeline passes it
    prev = {**p4b, "roles": {}}
    segs = load_segments(prev)
    speakers = sorted({s["speaker"] for s in segs})
    mapping, source, confidence = resolve_roles(prev, segs, speakers, cfg["phase6"]["role_mapping_override"])
    assert mapping == {"SPEAKER_1": "agent", "SPEAKER_2": "customer"}
    assert (source, confidence) == ("segment_roles", "high")

    units = make_units(segs, mapping, 20.0, cfg["phase6"]["min_unit_sec"], cfg["phase6"]["max_unit_sec"])
    # a tail shorter than min_unit_sec is absorbed into the previous piece (units.make_units)
    limit = cfg["phase6"]["max_unit_sec"] + cfg["phase6"]["min_unit_sec"]
    assert units and all(u["end"] - u["start"] < limit for u in units)

    cfg["phase6"]["baseline_units"] = 2           # customer baseline = the two calm units
    rows, errors = assemble_rows(units, _fake_results(units), pauses=[(5.0, 5.5)])
    assert errors == [] and len(rows) == len(units)
    baselines = apply_speaker_baselines(rows, cfg)
    assert baselines["SPEAKER_2"]["pitch_mean_hz"] == 200.0

    timeline = build_timeline(rows, cfg)
    angry = [x for x in timeline if x["voice_behaviour"] == "angry"]
    assert angry and all(x["role"] == "customer" for x in angry)
    assert all(x["voice_level_change"] == "raised_pitch_and_energy" for x in angry)
    assert all(x["behaviour_label"] == "frustrated" for x in angry)

    customer = build_role_report(timeline, "customer")
    assert customer["started_as"] == "neutral" and customer["ended_as"] == "angry"
    assert build_role_report(timeline, "agent")["angry_or_frustrated_timestamps"] == []


def test_p4b_uncertain_roles_still_flow_to_p6(cfg, monkeypatch):
    monkeypatch.setattr(role_classifier, "identify_roles",
                        lambda conv, spk, c, cid=None: ({s: "UNKNOWN" for s in spk}, "no idea"))
    p4b = run_phase4b(_phase4_like(cfg), "TEST", cfg)
    assert p4b["role_status"] == "role_uncertain"
    prev = {**p4b, "roles": {}}
    segs = load_segments(prev)
    mapping, source, confidence = resolve_roles(prev, segs, sorted({s["speaker"] for s in segs}), {})
    assert confidence == "low" and mapping["SPEAKER_1"] == "agent"


def test_assemble_rows_skips_failed_emotion_units():
    units = [{"start": 0.0, "end": 2.0, "speaker": "S1", "role": "agent"},
             {"start": 2.5, "end": 4.0, "speaker": "S2", "role": "customer"}]
    results = [({"energy_mean": 0.1, "pitch_error": "no voicing"}, ({"neutral": 1.0}, "neutral", None), 0.1),
               ({"energy_mean": 0.1}, ({"unknown": 1.0}, "unknown", "model crashed"), 0.1)]
    rows, errors = assemble_rows(units, results, [])
    assert [r["unit_id"] for r in rows] == [1]
    assert len(errors) == 2 and "model crashed" in errors[1]
    assert rows[0]["gap_before_sec"] is None and rows[0]["overlap_sec"] == 0.0
    assert "pitch_error" not in rows[0]
