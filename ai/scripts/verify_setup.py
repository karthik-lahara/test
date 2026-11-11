#!/usr/bin/env python
"""Report what is and isn't ready in this checkout.

    python scripts/verify_setup.py

Checks the interpreter, the installed packages, the external services
(ffmpeg, Ollama), the HF token, and the files that are still empty.
Exits 0 always -- it is a report, not a gate.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OK, WARN, BAD = "  OK  ", " WARN ", " FAIL "


def line(status, name, detail=""):
    print(f"[{status}] {name:<34} {detail}")


def header(text):
    print(f"\n--- {text} " + "-" * max(0, 56 - len(text)))


def version_of(mod):
    try:
        m = __import__(mod)
        return getattr(m, "__version__", "installed")
    except Exception as exc:
        return f"IMPORT ERROR: {type(exc).__name__}: {exc}"


def main():
    header("interpreter")
    v = sys.version_info
    line(OK if (v.major, v.minor) == (3, 12) else WARN,
         "python", f"{sys.version.split()[0]}  (project targets 3.12)")
    line(OK if sys.prefix != sys.base_prefix else WARN,
         "virtualenv active", sys.prefix)

    header("core packages")
    for mod in ("torch", "torchaudio", "numpy", "scipy", "soundfile",
                "soxr", "yaml", "transformers"):
        present = importlib.util.find_spec(mod) is not None
        line(OK if present else BAD, mod, version_of(mod) if present else "not installed")

    if importlib.util.find_spec("torch"):
        import torch
        line(OK, "torch.backends.mps", f"available={torch.backends.mps.is_available()}")
        line(WARN if not torch.cuda.is_available() else OK,
             "torch.cuda", f"available={torch.cuda.is_available()}  -> set DEVICE=cpu on macOS")

    header("per-phase packages")
    phases = {
        "P1 pyloudnorm": "pyloudnorm",
        "P1 deepfilternet": "df",
        "P2 pyannote.audio": "pyannote.audio",
        "P3 faster_whisper": "faster_whisper",
        "P4/P4b accelerate": "accelerate",
        "P4 bitsandbytes": "bitsandbytes",
        "P6 funasr": "funasr",
        "P6 silero_vad": "silero_vad",
        "P6 parselmouth": "parselmouth",
        "P6 onnxruntime": "onnxruntime",
        "API fastapi": "fastapi",
        "API boto3": "boto3",
    }
    # deepfilterlib has no 3.12 wheel, so requirements.txt gates deepfilternet to
    # python_version < "3.12". Absent on 3.12 is expected: Phase 1 falls back to
    # spectral gating (set DENOISE_METHOD=spectral to make that explicit).
    expected_absent = {"P1 deepfilternet": sys.version_info >= (3, 12)}
    for label, mod in phases.items():
        present = importlib.util.find_spec(mod.split(".")[0]) is not None
        if present:
            line(OK, label, "installed")
        elif expected_absent.get(label):
            line(WARN, label, "not installed (expected on 3.12) -- Phase 1 uses the spectral fallback")
        else:
            line(BAD, label, "not installed")

    header("external tools")
    ff = shutil.which("ffmpeg")
    line(OK if ff else WARN, "ffmpeg", ff or "not on PATH (soundfile+soxr fallback will be used)")

    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/version", timeout=3) as r:
            ver = json.load(r).get("version", "?")
        line(OK, "ollama server", f"up, version {ver}")
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=5) as r:
            names = [m["name"] for m in json.load(r).get("models", [])]
        has = any(n.startswith("gemma3:12b") for n in names)
        line(OK if has else BAD, "gemma3:12b (P5, P7)",
             "present" if has else f"missing -- run: ollama pull gemma3:12b  (have: {names})")
    except Exception as exc:
        line(BAD, "ollama server", f"unreachable ({exc}) -- run: ollama serve")

    header("credentials")
    tok = os.getenv("HF_TOKEN")
    line(OK if tok else BAD, "HF_TOKEN",
         f"set ({tok[:6]}...)" if tok else "not set -- P2 diarization will fail (P2_002)")
    dotenv_ok = importlib.util.find_spec("dotenv") is not None
    line(OK if dotenv_ok else WARN, "python-dotenv",
         "installed -- load_config() reads .env automatically"
         if dotenv_ok else "missing -- .env will NOT be auto-loaded; export vars manually")
    line(OK if os.path.exists(os.path.join(ROOT, ".env")) else WARN, ".env file",
         "present" if os.path.exists(os.path.join(ROOT, ".env")) else "missing -- cp .env.example .env")
    line(OK if os.getenv("STATIC_AUDIO_URL") else WARN, "STATIC_AUDIO_URL",
         "set" if os.getenv("STATIC_AUDIO_URL")
         else "empty -- pass --input or --url instead")

    header("pipeline-critical modules")
    checks = [
        ("phase2_speaker_diarization/postprocessor.py", "postprocess"),
        ("phase6_voice_behaviour_analysis/row_builder.py", "assemble_rows"),
        ("phase4b_speaker_roles/role_classifier.py", "identify_roles"),
        ("common/audio_fetcher.py", "download_audio"),
    ]
    for rel, func in checks:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            line(BAD, rel.split("/")[-1], f"EMPTY -- {func}() missing (on main; use the developer branch)")
            continue
        src = open(path, encoding="utf-8", errors="replace").read()
        has = f"def {func}" in src
        line(OK if has else BAD, rel.split("/")[-1],
             f"{func}() present" if has else f"{func}() MISSING")

    header("not wired up yet")
    bk = os.path.join(ROOT, "backend", "services", "job_service.py")
    bsrc = open(bk, encoding="utf-8", errors="replace").read() if os.path.exists(bk) else ""
    line(WARN if "run_pipeline" not in bsrc else OK, "backend -> run_pipeline",
         "POST /api/v1/analyze only stores the job in memory; audio.url is never fetched"
         if "run_pipeline" not in bsrc else "wired")
    rr = os.path.join(ROOT, "backend", "api", "routes", "result_routes.py")
    empty_rr = (not os.path.exists(rr)) or os.path.getsize(rr) == 0
    line(WARN if empty_rr else OK, "result_routes.py",
         "empty -- no endpoint returns a job/result" if empty_rr else "implemented")

    print("\nSee the 'Current status / known gaps' table in README.md for the rest.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
