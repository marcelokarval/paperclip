#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log() {
  printf '[%s] %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

load_env_file() {
  local env_file="$1"
  [ -f "$env_file" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"

    if [[ -z "${line//[[:space:]]/}" || "$line" =~ ^[[:space:]]*# ]]; then
      continue
    fi

    if [[ "$line" =~ ^[[:space:]]*export[[:space:]]+(.+)$ ]]; then
      line="${BASH_REMATCH[1]}"
    fi

    if [[ ! "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      warn "Ignoring invalid line in $env_file: $line"
      continue
    fi

    local key="${BASH_REMATCH[1]}"
    local value="${BASH_REMATCH[2]}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if [[ "$value" =~ ^\"(.*)\"$ ]]; then
      value="${BASH_REMATCH[1]}"
    elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi

    export "$key=$value"
  done < "$env_file"
}

load_vps_env() {
  local explicit_env="${PAPERCLIP_VPS_ENV_FILE:-}"
  if [ -n "$explicit_env" ]; then
    load_env_file "$explicit_env"
    return
  fi

  load_env_file "$REPO_ROOT/docker/vps/.env"
  load_env_file "$REPO_ROOT/.env.vps"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required"
}

registry_image() {
  local image_name="$1"
  local registry_url="${REGISTRY_URL:-}"
  local namespace="${REGISTRY_NAMESPACE:-}"

  if [ -z "$registry_url" ]; then
    echo "$image_name"
  elif [ -n "$namespace" ]; then
    echo "$registry_url/$namespace/$image_name"
  else
    echo "$registry_url/$image_name"
  fi
}
