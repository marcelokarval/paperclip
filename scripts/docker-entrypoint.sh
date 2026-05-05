#!/bin/sh
set -e

# Capture runtime UID/GID from environment variables, defaulting to 1000
PUID=${USER_UID:-1000}
PGID=${USER_GID:-1000}

# Adjust the node user's UID/GID if they differ from the runtime request
# and fix volume ownership only when a remap is needed
changed=0

if [ "$(id -u node)" -ne "$PUID" ]; then
    echo "Updating node UID to $PUID"
    usermod -o -u "$PUID" node
    changed=1
fi

if [ "$(id -g node)" -ne "$PGID" ]; then
    echo "Updating node GID to $PGID"
    groupmod -o -g "$PGID" node
    usermod -g "$PGID" node
    changed=1
fi

if [ "$changed" = "1" ]; then
    chown -R node:node /paperclip
fi

mkdir -p /paperclip /paperclip/.codex
if ! gosu node sh -c '
    test -w /paperclip &&
    test -w /paperclip/.codex &&
    { [ ! -e /paperclip/.codex/config.toml ] || test -r /paperclip/.codex/config.toml; } &&
    { [ ! -e /paperclip/.codex/auth.json ] || test -r /paperclip/.codex/auth.json; }
'; then
    echo "Fixing /paperclip volume ownership for node user"
    chown -R node:node /paperclip
fi

exec gosu node "$@"
