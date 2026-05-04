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
APP_REGISTRY_IMAGE="${PAPERCLIP_IMAGE:-$(registry_image "$APP_IMAGE_NAME")}"

cd "$REPO_ROOT"

log "Building Paperclip VPS image"
log "Local image: $APP_IMAGE_NAME"
log "Registry image: $APP_REGISTRY_IMAGE"
log "Version: $VERSION"

docker build \
  --build-arg "USER_UID=$USER_UID" \
  --build-arg "USER_GID=$USER_GID" \
  -t "$APP_IMAGE_NAME:$VERSION" \
  -t "$APP_IMAGE_NAME:latest" \
  -f Dockerfile \
  .

docker tag "$APP_IMAGE_NAME:$VERSION" "$APP_REGISTRY_IMAGE:$VERSION"
docker tag "$APP_IMAGE_NAME:latest" "$APP_REGISTRY_IMAGE:latest"

if [ -n "${REGISTRY_URL:-}" ] && [ -n "${REGISTRY_USERNAME:-}" ] && [ -n "${REGISTRY_PASSWORD:-}" ]; then
  log "Logging in to $REGISTRY_URL"
  if ! printf '%s' "$REGISTRY_PASSWORD" | docker login "$REGISTRY_URL" --username "$REGISTRY_USERNAME" --password-stdin; then
    die "Docker registry login failed"
  fi
  trap 'docker logout "$REGISTRY_URL" >/dev/null 2>&1 || true' EXIT
else
  warn "REGISTRY_URL/REGISTRY_USERNAME/REGISTRY_PASSWORD not fully set; assuming the registry is already authenticated or public"
fi

docker push "$APP_REGISTRY_IMAGE:$VERSION"
docker push "$APP_REGISTRY_IMAGE:latest"

log "Published:"
log "$APP_REGISTRY_IMAGE:$VERSION"
log "$APP_REGISTRY_IMAGE:latest"
