#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
  .venv/bin/python -m pip install -r requirements.txt
fi
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run build
export AWS_PROFILE="${AWS_PROFILE:-default}"
exec .venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port "${PORT:-8000}"
