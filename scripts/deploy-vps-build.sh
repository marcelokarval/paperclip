#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy-vps-lib.sh
source "$SCRIPT_DIR/deploy-vps-lib.sh"

load_vps_env
require_command docker

APP_IMAGE_NAME="${APP_IMAGE_NAME:-paperclip}"
VERSION="${1:-${VERSION:-$(date +%Y%m%d%H%M%S)}}"
USER_UID="${USER_UID:-1000}"
USER_GID="${USER_GID:-1000}"

cd "$REPO_ROOT"

log "Building Paperclip VPS image"
log "Image: $APP_IMAGE_NAME"
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
