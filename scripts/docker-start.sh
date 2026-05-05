#!/bin/sh
set -eu

SERVER_HOST="${HOST:-0.0.0.0}"
SERVER_PORT="${PORT:-3100}"
AUTO_BOOTSTRAP="${PAPERCLIP_AUTO_BOOTSTRAP_CEO:-true}"

echo "Starting Paperclip on ${SERVER_HOST}:${SERVER_PORT} (auto bootstrap CEO: ${AUTO_BOOTSTRAP})"
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
