#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major !== 24 || minor < 22) { console.error("Use Node 24.22+ LTS: run nvm install && nvm use (see .nvmrc)."); process.exit(1); }'
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install --require-hashes -r requirements.lock
npm ci
npm run build
export AWS_PROFILE="${AWS_PROFILE:-default}"
exec .venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port "${PORT:-8000}"
