#!/usr/bin/env bash
# =====================================================================
#  Setup for macOS / Apple Silicon (CPU only -- no CUDA).
#
#  The project targets Python 3.12 + NVIDIA CUDA 12.6. On a Mac the
#  CUDA-only pieces cannot work; see requirements-macos.txt and the
#  "known gaps" table in README.md. This script sets up everything
#  that CAN run locally.
#
#  Usage:  bash scripts/setup_macos.sh
# =====================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

PY312="/opt/homebrew/opt/python@3.12/bin/python3.12"

echo "==> 1/5  system packages (python@3.12, ffmpeg, ollama)"
export HOMEBREW_NO_AUTO_UPDATE=1
brew install python@3.12 ffmpeg ollama

echo "==> 2/5  virtualenv at ./venv"
[ -d venv ] || "$PY312" -m venv venv
./venv/bin/python -m pip install --upgrade pip wheel setuptools

echo "==> 3/5  python dependencies (macOS variant)"
./venv/bin/python -m pip install -r requirements-macos.txt

echo "==> 4/5  .env"
[ -f .env ] || cp .env.example .env
echo "    edit .env and set HF_TOKEN=hf_... before running the pipeline"

echo "==> 5/5  ollama model for Phases 5 and 7"
if ! curl -s --max-time 2 http://127.0.0.1:11434/api/version >/dev/null; then
  echo "    starting ollama server in the background"
  nohup ollama serve >/tmp/ollama-serve.log 2>&1 &
  for _ in $(seq 1 30); do
    curl -s --max-time 2 http://127.0.0.1:11434/api/version >/dev/null && break
    sleep 1
  done
fi
ollama pull gemma3:12b

cat <<'DONE'

Setup finished. To use it:

    source venv/bin/activate
    set -a; source .env; set +a        # the code does NOT read .env by itself
    ollama serve &                     # if not already running

Then, per README.md:

    python -m pipeline.run_pipeline --input data/input/call1.mp3 --call-id CALL001

Note: an end-to-end run will NOT succeed yet. Three files imported by the
pipeline are empty in this repo, and two phases need CUDA. Run
`python scripts/verify_setup.py` for the current picture.
DONE
