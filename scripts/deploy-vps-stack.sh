#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy-vps-lib.sh
source "$SCRIPT_DIR/deploy-vps-lib.sh"

load_vps_env
require_command docker

STACK_NAME="${STACK_NAME:-paperclip}"
DEPLOY_INFRA="${DEPLOY_INFRA:-false}"

for arg in "$@"; do
  case "$arg" in
    --infra)
      DEPLOY_INFRA=true
      ;;
    --no-infra)
      DEPLOY_INFRA=false
      ;;
    --stack=*)
      STACK_NAME="${arg#--stack=}"
      ;;
    *)
      die "Unknown argument: $arg"
      ;;
  esac
done

ensure_overlay_network() {
  local network_name="${1:-portainer_agent_network}"
  if docker network inspect "$network_name" >/dev/null 2>&1; then
    log "Network exists: $network_name"
    return
  fi
  log "Creating overlay network: $network_name"
  docker network create --driver overlay --attachable "$network_name" >/dev/null
}

ensure_volume() {
  local volume_name="$1"
  if docker volume inspect "$volume_name" >/dev/null 2>&1; then
    log "Volume exists: $volume_name"
    return
  fi
  log "Creating volume: $volume_name"
  docker volume create "$volume_name" >/dev/null
}

cd "$REPO_ROOT"

ensure_overlay_network "${TRAEFIK_NETWORK:-portainer_agent_network}"
ensure_volume paperclip_data

if [ "$DEPLOY_INFRA" = "true" ]; then
  ensure_volume postgres_data
  ensure_volume minio_data
  ensure_volume checkout_scripts

  log "Deploying PostgreSQL infrastructure stack"
  docker stack deploy -c docker/vps/infra-postgres.yml postgres

  log "Deploying MinIO infrastructure stack"
  docker stack deploy -c docker/vps/infra-minio.yml minio

  if [ "${DEPLOY_REDIS_INFRA:-false}" = "true" ]; then
    ensure_volume redis_data
    ensure_volume redis_landing_data
    ensure_volume redis_n8n_data
    ensure_volume redis_evolution_data
    ensure_volume redis_chatwoot_data
    ensure_volume redis_mautic_data

    log "Deploying Redis infrastructure stack"
    docker stack deploy -c docker/vps/infra-redis.yml redis
  fi
fi

log "Deploying Paperclip stack: $STACK_NAME"
docker stack deploy -c docker/vps/paperclip-stack.yml "$STACK_NAME"

log "Current services"
docker stack services "$STACK_NAME"
