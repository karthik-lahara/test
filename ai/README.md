# AI Voice Analysis — Employee Call Monitoring

Analyses a recorded phone call between an **agent** (employee) and a **customer**, and produces a
final report covering what was said, how each side behaved (from the words *and* the voice), and
exactly which timestamps a human should listen to.

Everything runs locally on an NVIDIA GPU — open-source models from Hugging Face plus a local
[Ollama](https://ollama.com) server. No audio or text is sent to a cloud AI service.

```
call.mp3 ─► P1 audio prep ─► P2 diarization ─► P3 speech-to-text ─► P4 translation ─► P4b speaker roles
                                                                                          │
                                                                    ┌─────────────────────┴─────────────────────┐
                                                                    ▼                                           ▼
                                                       P5 text behaviour analysis                 P6 voice behaviour analysis
                                                       (words: Gemma via Ollama)                  (audio: emotion, pitch, energy, pauses)
                                                                    └─────────────────────┬─────────────────────┘
                                                                                          ▼
                                                                 P7 overall conversation analysis (text + voice)
                                                                                          ▼
                                                                                    final report
```

Speaker identification (P4b) is handed **in parallel** to both branches: text behaviour (P5) and
voice behaviour (P6) each use the same AGENT / CUSTOMER roles, and P7 fuses their results.

---

## Contents

- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [Pipeline logic, phase by phase](#pipeline-logic-phase-by-phase)
- [Final report](#final-report)
- [REST API (MERN integration)](#rest-api-mern-integration)
- [Configuration](#configuration)
- [Outputs on disk](#outputs-on-disk)
- [Error codes](#error-codes)
- [Current status / known gaps](#current-status--known-gaps)

---

## Quick start

### Requirements

- Python 3.12, NVIDIA GPU with CUDA 12.6 drivers
- `ffmpeg` on `PATH` (decoder; falls back to `soundfile` + `soxr` without it)
- A Hugging Face token with the terms accepted for `pyannote/speaker-diarization-community-1`
- Ollama with `gemma3:12b` (Phases 5 and 7)
- A **separate** Python venv for NVIDIA Parakeet (English ASR), path set in
  `phase3.parakeet.python_executable`

### Install

```bash
python -m venv venv
venv\Scripts\activate            # Windows  (source venv/bin/activate on Linux)
pip install -r requirements.txt

ollama serve
ollama pull gemma3:12b

set HF_TOKEN=hf_xxx              # Windows  (export HF_TOKEN=hf_xxx on Linux)
```

### Run one call end-to-end

```bash
python -m pipeline.run_pipeline --input data/input/call1.mp3 --call-id CALL001
```

Prints a short summary (call assessment, agent/customer verdict, number of review flags) and exits
`0` on success, `1` on failure. The full result is written to `data/results/CALL001.json`.

### Run a single phase

Each phase can be run on its own; it reads the previous phase's JSON from
`data/processed/<call_id>/`:

```bash
python -m phase1_audio_preparation.prepare_audio --input data/input/call1.mp3 --call-id CALL001
python -m phase2_speaker_diarization.diarize                    --call-id CALL001
python -m phase3_asr_text.transcribe                            --call-id CALL001
python -m phase4_language_translation.translate                 --call-id CALL001
python -m phase4b_speaker_roles.identify_roles                  --call-id CALL001
python -m phase5_text_behaviour_analysis.analyze_text_behaviour --call-id CALL001
python -m phase6_voice_behaviour_analysis.analyze_voice_behaviour --call-id CALL001
python -m phase7_overall_conversation_analysis.analyze_overall_conversation --call-id CALL001
```

### Start the API

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

---

## Project layout

```
config/config.yaml                     all settings (one section per phase)
common/                                shared helpers
  config_loader.py                     loads YAML, applies env overrides, creates data/log folders
  logger.py                            console + rotating logs/pipeline.log + logs/calls/<call_id>.log
  exceptions.py                        PipelineError + per-phase error codes
  audio_utils.py                       wav read/write, RMS/dBFS, device selection, timers
pipeline/run_pipeline.py               runs every phase for one call, never raises
phase1_audio_preparation/              decode, validate, denoise, loudness-normalise
phase2_speaker_diarization/            who spoke when (pyannote)
phase3_asr_text/                       language detection + speech-to-text
phase4_language_translation/           translate to English
phase4b_speaker_roles/                 label speakers AGENT / CUSTOMER
phase5_text_behaviour_analysis/        text behaviour analysis (Ollama) — also the shared LLM helpers
phase6_voice_behaviour_analysis/       emotion / pitch / energy / pauses from the audio
phase7_overall_conversation_analysis/  text + voice fusion -> final report
backend/                               FastAPI service the MERN app calls
gpu_worker/                            planned separate GPU worker service (empty for now)
data/  input | processed | transcripts | results | features
logs/
tests/
```

---

## Pipeline logic, phase by phase

`pipeline/run_pipeline.py` runs Phases 1 → 4b in order, passing each phase's result dict to the
next. The Phase 4b result (segments + speaker roles) then goes to **both** Phase 5 (text) and
Phase 6 (voice), and Phase 7 combines the two.
Each phase also saves its own `phaseN_result.json` so it can be inspected or re-run alone.
Any `PipelineError` stops the run with `status: "failed"` and a structured error; any other exception
is caught as `GEN_999`. The result file is always written.

### Phase 1 — Audio preparation (`phase1_audio_preparation/`)

1. **Decode** to mono float32 at 16 kHz — `ffmpeg` first, `soundfile` + `soxr` as fallback.
2. **Validate** — fails if shorter than `min_duration_sec` (2 s) or effectively silent
   (RMS < `silence_rms_threshold`).
3. **Denoise**
   - `deepfilternet` (default): neural denoiser. Audio is resampled to 48 kHz, processed in 60 s
     chunks with 0.5 s cross-fade overlap, then resampled back. A small shim patches
     `torchaudio.backend.common`, which DeepFilterNet 0.5.x still imports.
   - `spectral` (automatic fallback): STFT spectral gating — noise profile from the quietest 10 %
     of frames, smoothed soft mask, floor of 0.1 so speech isn't hollowed out.
   - `none`: pass-through.
4. **Normalise** loudness to −20 LUFS (`pyloudnorm`). Falls back to RMS normalisation if
   loudness can't be measured; always ends with a peak limiter at −1 dBFS so nothing clips.
5. Save `prepared.wav` (plus `denoised.wav` when `keep_intermediate_files` is on).

### Phase 2 — Speaker diarization (`phase2_speaker_diarization/`)

1. Load `pyannote/speaker-diarization-community-1` once per process (cached), on GPU if available.
   Needs `HF_TOKEN`. Works with pyannote 3.x and 4.x.
2. Run diarization with `num_speakers` / `min_speakers` / `max_speakers` from config.
3. **Post-process**: drop segments shorter than 0.3 s, merge same-speaker segments less than
   0.5 s apart, relabel speakers in order of first appearance (`SPEAKER_1`, `SPEAKER_2`, …).
4. Export an RTTM file and one wav clip per segment (±0.1 s padding) — the clips are the
   input to Phase 3.

### Phase 3 — Speech-to-text (`phase3_asr_text/`)

1. **Language detection** — `faster-whisper` (`small`) listens to the longest speech segments
   (up to 30 s). `ur` is mapped to `hi`, because Whisper often labels Hindi calls as Urdu.
   `force_language` skips detection.
2. **Routing**
   - English → **NVIDIA Parakeet TDT 0.6B v2**. Runs in a separate venv via an async subprocess;
     all clips of the call go in one run so the model loads once per call.
   - 22 Indian languages → **AI4Bharat IndicConformer 600M** in a process pool (CTC or RNNT decoding).
   - Anything else → `P3_003_UNSUPPORTED_LANGUAGE`.
3. Segments shorter than 0.3 s are marked `skipped`. Each segment gets a status
   (`success | empty | error | skipped`); output order always matches the segment order.
   The phase fails only if *every* segment errors.
4. Saves the transcript to `phase3_result.json` and `data/transcripts/<call_id>.json`.

### Phase 4 — Translation (`phase4_language_translation/`)

- Adds `text_english` to every segment and `transcript_english` for the whole call; the original
  text is kept.
- English calls are copied as-is (no model loaded).
- Otherwise uses `bodhan-ai/indic-translate` in 4-bit (bitsandbytes), beam search 3. The prompt
  asks it to preserve meaning, use standard English spellings for names, write spoken numbers as
  digits and not guess unclear words.
- Text longer than 1500 characters is split at sentence ends (`. ! ? । ॥ ؟`). Empty or number-only
  text is skipped, and repeated lines are cached.

### Phase 4b — Speaker roles (`phase4b_speaker_roles/`)

- Builds a short conversation (first 20 turns, ≤ 3000 chars, English text preferred, consecutive
  lines from one speaker joined) and asks **Qwen3-1.7B** which speaker is the AGENT and which the
  CUSTOMER.
- `role_status`: `ok` (one agent + customer(s)), `role_uncertain` (model unsure → all `UNKNOWN`),
  or `single_speaker`. An uncertain result **does not** fail the pipeline; later phases fall back
  to their own role detection.
- Writes `role` onto every segment.
- This speaker identification is passed **in parallel** to Phase 5 (text behaviour) and Phase 6
  (voice behaviour), so both analyses use the same agent/customer split.

### Phase 5 — Text behaviour analysis (`phase5_text_behaviour_analysis/`)

The **text branch**. It takes the Phase 4b segments and roles and analyses the words with Gemma 3 12B
(local Ollama) in these steps:

1. **Roles** — manual map in config → Phase 4b (if `ok`) → Gemma role step → roles taken from the
   summary → unknown (agent/customer behaviour is then skipped).
2. **Summary** — summary, entities and customer interest.
3. **Behaviour** — agent, customer and overall conversation.
4. **Human review** — timestamped flags from verified negative evidence.
5. **Timing** — model load / prompt / generation time per stage.

Output: `phase5_result.json` (detailed) and `phase5_compact.json` (compact).

Its modules are also the shared LLM toolkit that Phase 7 uses:

- `ollama_client.py` — HTTP client for Ollama's `/api/generate` with JSON-schema structured output,
  retries over a list of temperatures, a smaller-context fallback, and per-stage timing. `num_ctx`
  is kept constant on purpose, since changing it makes Ollama reload the model.
- `role_detection.py` — role priority: manual map in config → Phase 4b (if `ok`) → Gemma role step
  → roles taken from the summary → unknown.
- `summarizer.py`, `behaviour_analyzer.py` — summary, entities, customer interest, and per-role
  behaviour.
- Every behaviour must come with an **evidence quote**, which is checked against the real
  transcript. Unverifiable quotes are dropped, so the model can't invent evidence.

Behaviour labels:

| Positive | Negative |
|---|---|
| empathetic, cooperative, professional, calm | frustrated, angry, impatient, dismissive, rude, abusive, aggressive, threatening, hostile |

### Phase 6 — Voice behaviour analysis (`phase6_voice_behaviour_analysis/`) — no LLM

The **voice branch**, running alongside Phase 5 on the same Phase 4b speaker roles.

1. **Roles** — config override → `role` on the Phase 4b segments → a role mapping in the JSON →
   last resort: first speaker = agent (`confidence: low`, logged as a warning).
2. **Units** — each agent/customer turn is split into pieces of ≤ 4 s (shorter than 0.5 s is
   dropped), so an emotion change inside a long turn is still seen.
3. **Pauses** — Silero VAD over the whole call; gaps ≥ 0.3 s are pauses. Each unit gets
   pause count, total, longest and ratio.
4. **Per unit, in parallel** (async; Emotion2Vec in one thread with a lock, pitch/energy in a
   process pool):
   - **Emotion2Vec+ large** → scores for angry / disgust / fear / sad / happy / neutral / surprise
     / …, the top emotion, and a valence score from −1 to +1.
   - **Praat (parselmouth)** → pitch mean/min/max/std (65–500 Hz) and RMS energy.
5. **Speaker baselines** — each speaker's first 3 valid units are their baseline. A unit is
   "elevated" when pitch > 1.15× or energy > 1.25× that speaker's own baseline, so naturally loud
   or high voices aren't penalised.
6. **Report**
   - Emotion → voice behaviour: `angry`→angry, `disgust`→frustrated, `fear`/`sad`→distressed,
     `happy`/`excited`→positive, `neutral`→neutral.
   - Confidence bands: ≥ 0.60 higher, ≥ 0.35 medium, below that low.
   - Per role: dominant emotion, % share of time per emotion, started-as/ended-as, and emotion runs
     (same-label units < 0.5 s apart are merged) with every change point and timestamp.
   - All angry/frustrated/distressed units are listed with timestamps, marked for human review.
   - Rudeness is deliberately **not** inferred from the voice — that needs the words (Phase 7).

### Phase 7 — Overall conversation analysis (`phase7_overall_conversation_analysis/`)

Combines the text (Gemma 3 12B via Ollama) and the voice (Phase 6 result) into the final report.

**Text side**

1. **Roles** — same priority as Phase 5.
2. **Summary** — summary, main topic, customer concerns and requests, agent actions, agreements,
   important details, unresolved issues, resolution status, conversation completion, customer
   interest level, entities (names, companies, products, dates, contacts…), and **follow-up**
   (`recommended | required | not_required | unclear`).
3. **Behaviour** for agent, customer and the overall conversation, with **fixed severity weights**.
   When any negative label is present, Python (not the model) picks the heaviest one as primary:

   | label | weight | label | weight |
   |---|---|---|---|
   | threatening | 100 | angry | 50 |
   | abusive | 90 | frustrated | 40 |
   | aggressive | 80 | dismissive | 30 |
   | hostile | 70 | impatient | 20 |
   | rude | 60 | unclear_text | 10 |

4. **Line-by-line tone check** — every agent line is checked on its own, in batches of 8, so a
   single abusive line can't be hidden by an otherwise polite call. Each line gets an English
   translation and a tone: `polite | neutral | impolite | abusive | threatening | unclear`.
   `impolite`/`abusive`/`threatening` add `rude`/`abusive`/`threatening` to that role's behaviour,
   make it NEGATIVE, and flag the line. Long `unclear` lines (≥ 40 chars) are flagged as
   `unclear_text` (garbled transcript — listen to the audio).
5. **Text review flags** — verified evidence quotes and tone-check lines become timestamped flags.

**Voice side (pure Python fusion)**

6. **Alignment** — every transcript line gets the voice units that overlap it in time, its dominant
   voice behaviour, and its strongest negative voice unit. Each line is then tagged
   `negative_text_and_voice | negative_text_only | negative_voice_only | none`.
7. **Voice flags** — a negative voice unit with score ≥ 0.35 becomes a flag
   (`voice:angry` 45, `voice:frustrated` 35, `voice:distressed` 25). A line flagged by **both** text
   and voice is marked **corroborated** and ranked first at equal severity.
8. **Assessments**
   - Per role: voice counts as negative when angry + disgust + fear + sad ≥ 30 % of that role's
     speaking time.

     | text | voice | assessment |
     |---|---|---|
     | NEGATIVE | negative | `negative_confirmed` |
     | NEGATIVE | — | `negative_text` |
     | — | negative | `negative_voice` |
     | POSITIVE | not negative | `positive` |
     | otherwise | | `neutral` |

   - **Call assessment** = the worst of the agent and customer assessments, in the order
     `negative_confirmed > negative_text > negative_voice > neutral > positive`.

Without a Phase 6 result, Phase 7 still runs and produces a text-only report.

---

## Final report

`data/results/<call_id>_final_report.json` — the compact report meant for the MERN callback:

```jsonc
{
  "call_id": "CALL001",
  "status": "completed",
  "language": "hi",
  "call_duration_sec": 312.4,
  "roles": { "agent_speaker": "SPEAKER_1", "customer_speakers": ["SPEAKER_2"],
             "confidence": "high", "source": "phase4b_speaker_roles" },
  "call_assessment": "negative_text",
  "summary": { "summary": "...", "main_topic": "...", "follow_up": "required",
               "resolution_status": "unresolved", "customer_interest": "...", "entities": {...}, ... },
  "agent":    { "text_behaviour": { "primary_behaviour": "rude", "primary_severity_weight": 60,
                                    "overall_behaviour": "NEGATIVE", "behaviour_labels": [...], "reason": "..." },
                "combined": { "assessment": "negative_text", "voice_dominant_emotion": "neutral",
                              "voice_negative_share_pct": 12.5, "text_voice_agree": false, ... } },
  "customer": { ... },
  "overall":  { "text_behaviour": {...}, "voice_call_result": "anger_or_frustration_detected_review_timestamps" },
  "human_review": {
    "review_required": true, "flagged_segment_count": 3, "corroborated_count": 1,
    "flags": [ { "review_priority": 1, "timestamp": "01:12.40 - 01:16.90", "speaker": "SPEAKER_1",
                 "role": "agent", "text": "...", "english_translation": "...",
                 "priority_behaviour": "rude", "severity_weight": 60,
                 "behaviours": ["rude", "voice:angry"], "evidence_sources": ["text", "voice"],
                 "corroborated": true, "reasons": ["..."] } ]
  },
  "timing": { ... }, "errors": []
}
```

All emotion/behaviour outputs are **model predictions, not validated accuracy**. Flagged timestamps
are for a human to listen to before any decision is made about an agent or customer.

---

## REST API (MERN integration)

`backend/main.py` (FastAPI)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | health check |
| POST | `/api/v1/analyze` | queue a call for analysis → `202 Accepted` with `job_id` |

Request headers: `X-Timestamp`, `X-Signature`. Body:

```json
{
  "requestId": "req_123",
  "audio":   { "url": "<presigned S3 URL>", "expiresAt": "...", "mimeType": "audio/mpeg",
               "sizeBytes": 123456, "sha256": "..." },
  "call":    { "direction": "incoming", "startedAt": "...", "durationSec": 312 },
  "employee":{ "code": "E001", "name": "...", "department": "...", "designation": "..." },
  "callbackUrl": "https://mern-backend/api/calls/callback"
}
```

Intended flow: download the audio from S3 → verify `sha256` → `run_pipeline()` → POST
`final_report` (or `error`) to `callbackUrl`. See [known gaps](#current-status--known-gaps) for
what is implemented today.

---

## Configuration

All settings live in `config/config.yaml`, one section per phase. Each key is commented in the file.

Environment variables override config:

| Variable | Overrides |
|---|---|
| `HF_TOKEN` | `phase2.hf_token` (also used by Phases 3, 4, 4b) |
| `DEVICE` | `runtime.device` (`auto | cuda | cpu`) |
| `DIARIZATION_MODEL` | `phase2.model_name` |
| `NUM_SPEAKERS` | `phase2.num_speakers` |
| `DENOISE_METHOD` | `phase1.denoise.method` |
| `CONFIG_PATH` | path to an alternative config file |
| `LOG_LEVEL` | log level (default `INFO`) |

Common tweaks:

- **Two-party calls** — set `phase2.num_speakers: 2` for more stable diarization.
- **Known roles** — `phase5.speaker_role_map` / `phase7.speaker_role_map` /
  `phase6.role_mapping_override`, e.g. `{SPEAKER_1: agent, SPEAKER_2: customer}`.
- **Known language** — `phase3.language_detection.force_language: hi`.
- **Analyse the English translation instead of the original** — `phase7.text_field: text_english`.

### Models used

| Phase | Model |
|---|---|
| 1 | DeepFilterNet 0.5.6 |
| 2 | pyannote/speaker-diarization-community-1 |
| 3 | faster-whisper `small` (language ID), nvidia/parakeet-tdt-0.6b-v2 (English), ai4bharat/indic-conformer-600m-multilingual (Indic) |
| 4 | bodhan-ai/indic-translate (4-bit) |
| 4b | Qwen/Qwen3-1.7B |
| 5, 7 | gemma3:12b via Ollama |
| 6 | iic/emotion2vec_plus_large, Silero VAD, Praat (parselmouth) |

---

## Outputs on disk

```
data/processed/<call_id>/
  denoised.wav, prepared.wav           Phase 1
  phase1_result.json
  diarization.rttm, segments/*.wav     Phase 2
  phase2_result.json
  phase3_result.json                   (+ data/transcripts/<call_id>.json)
  phase4_result.json
  phase4b_result.json
  phase5_result.json, phase5_compact.json
  phase6_result.json
  phase7_result.json                   detailed (evidence, aligned text+voice lines, timing)
  phase7_final_report.json             compact
data/results/<call_id>.json            full pipeline result (all phases + final_report or error)
data/results/<call_id>_final_report.json
logs/pipeline.log                      all calls (rotating, 10 MB × 5)
logs/calls/<call_id>.log               one call only
```

`data/` and `logs/` contents are git-ignored.

---

## Error codes

Each failure returns `{error_code, error_name, phase, message, details}`.

| Prefix | Phase | Examples |
|---|---|---|
| `GEN_` | general | `GEN_001` config not found, `GEN_002` invalid config, `GEN_999` unknown |
| `P1_` | audio prep | `P1_001` input not found, `P1_006` too short, `P1_008` silent, `P1_010` denoise failed |
| `P2_` | diarization | `P2_002` HF token missing, `P2_003` model load failed, `P2_005` no speech, `P2_008` GPU OOM |
| `P3_` | ASR | `P3_003` unsupported language, `P3_004` Indic model failed, `P3_005` Parakeet failed, `P3_006` all segments failed |
| `P4_` | translation | `P4_002` model load failed, `P4_003` translation failed, `P4_004` GPU OOM |
| `P4B_` | roles | `P4B_002` model load failed, `P4B_003` classification failed |
| `P5_` / `P7_` | text analysis | `_002` Ollama unavailable, `_003` analysis failed, `_004` save failed |
| `P6_` | voice | `P6_002` model load failed, `P6_003` no usable units |

Full list: `common/exceptions.py`.

---

## Current status / known gaps

The pipeline logic above is the design in the code today. These pieces are **empty or incomplete**
and need finishing before an end-to-end run will work:

| File | Status |
|---|---|
| `pipeline/run_pipeline.py`, `config/config.yaml` | runs Phases 5 and 6 one after the other, not in parallel. It also skips Phase 5 unless `pipeline.run_phase5` is `true`, and that is currently `false` |
| `phase2_speaker_diarization/postprocessor.py` | **empty** — `postprocess()` is imported by Phase 2 |
| `phase6_voice_behaviour_analysis/row_builder.py` | **empty** — `assemble_rows()` / `apply_speaker_baselines()` are imported by Phase 6 |
| `phase4b_speaker_roles/role_classifier.py` | contains a copy of `conversation_builder.py`; `identify_roles()` is missing |
| `backend/services/job_service.py` | jobs are only stored in memory — S3 download, `run_pipeline()` and the callback are not wired in yet |
| `backend/api/routes/call_routes.py` | `X-Signature` / `X-Timestamp` are required but **not verified** yet |
| `backend/api/routes/result_routes.py`, `backend/services/gpu_service.py`, `result_service.py` | empty |
| `gpu_worker/` (Dockerfile, API, services) | empty — planned separate GPU worker |
| `tests/test_pipeline.py`, `scripts/run_project.ps1`, `.env.example`, `.dockerignore` | empty |
| `phase1.silence_trim` / `phase1.validation` extension + size limits in config | defined in config, not applied in code yet |
