#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy-vps-lib.sh
source "$SCRIPT_DIR/deploy-vps-lib.sh"

load_vps_env
require_command docker

APP_IMAGE_NAME="${APP_IMAGE_NAME:-paperclip}"
DEFAULT_BRANCH="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo main)"
BRANCH="${1:-${BRANCH:-$DEFAULT_BRANCH}}"
VERSION="${VERSION:-${CUSTOM_VERSION:-$(date +%Y%m%d%H%M%S)}}"
USER_UID="${USER_UID:-1000}"
USER_GID="${USER_GID:-1000}"

cd "$REPO_ROOT"

if [ -n "$BRANCH" ]; then
  log "Updating repository branch: $BRANCH"
  git fetch origin
  git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
  git reset --hard "origin/$BRANCH"
  git pull origin "$BRANCH"
fi

log "Building Paperclip VPS image"
log "Image: $APP_IMAGE_NAME"
log "Branch: $BRANCH"
log "Version: $VERSION"

docker build \
  --build-arg "USER_UID=$USER_UID" \
  --build-arg "USER_GID=$USER_GID" \
  -t "$APP_IMAGE_NAME:$VERSION" \
  -t "$APP_IMAGE_NAME:latest" \
  -f Dockerfile \
  .

log "Build complete"
docker images "$APP_IMAGE_NAME"
