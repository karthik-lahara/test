#!/usr/bin/env bash
# Start the FastAPI backend that the MERN app (and Postman) calls.
#
#   bash scripts/run_api.sh              # 127.0.0.1:8000
#   PORT=9000 bash scripts/run_api.sh
#
# The backend imports only fastapi/pydantic -- NOT the ML pipeline -- so this
# runs even while the torch stack is still installing.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

if [ -f .env ]; then
  set -a; . ./.env; set +a      # the code never calls load_dotenv() itself
fi

exec ./venv/bin/python -m uvicorn backend.main:app --host "$HOST" --port "$PORT" --reload
