#!/usr/bin/env bash

# Paperclip VPS setup helper.
#
# Usage:
#   sudo ./setup-paperclip-vps.sh [branch]
#
# Environment overrides:
#   REPOSITORY_URL=https://github.com/<owner>/paperclip.git
#   PROJECT_DIR=paperclip

set -euo pipefail

BRANCH="${1:-local-pr-d-data-integrity-cascades}"
PROJECT_DIR="${PROJECT_DIR:-paperclip}"
REPOSITORY_URL="${REPOSITORY_URL:-https://github.com/marcelokarval/paperclip.git}"
ENV_SOURCE="${ENV_SOURCE:-.env}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
  exit 1
}

warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

echo "========================================="
echo "   Setup Paperclip VPS"
echo "========================================="
echo "   Branch: $BRANCH"
echo "   Repo:   $REPOSITORY_URL"
echo "========================================="
echo ""

if ! command -v git >/dev/null 2>&1; then
  error "Git não está instalado"
fi

log "Iniciando setup do Paperclip..."

if [ -d "$PROJECT_DIR" ]; then
  warning "Diretório $PROJECT_DIR já existe."
  log "Atualizando repositório existente para branch: $BRANCH"

  cd "$PROJECT_DIR"

  if [ -f "docker/vps/.env" ]; then
    log "Fazendo backup de docker/vps/.env..."
    cp docker/vps/.env ../.env.paperclip-vps.backup
  elif [ -f ".env.vps" ]; then
    log "Fazendo backup de .env.vps..."
    cp .env.vps ../.env.paperclip-vps.backup
  fi

  log "Buscando atualizações..."
  git fetch --all --prune

  log "Mudando para branch: $BRANCH"
  git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"

  log "Atualizando código..."
  git reset --hard "origin/$BRANCH"
  git pull origin "$BRANCH"

  if [ -f "../.env.paperclip-vps.backup" ]; then
    log "Restaurando docker/vps/.env..."
    cp ../.env.paperclip-vps.backup docker/vps/.env
    rm ../.env.paperclip-vps.backup
  fi

  cd ..
else
  log "Clonando repositório (branch: $BRANCH)..."
  git clone -b "$BRANCH" "$REPOSITORY_URL" "$PROJECT_DIR"

  if [ -f "$ENV_SOURCE" ]; then
    log "Copiando $ENV_SOURCE para $PROJECT_DIR/docker/vps/.env..."
    cp "$ENV_SOURCE" "$PROJECT_DIR/docker/vps/.env"
  else
    warning "$ENV_SOURCE não encontrado na pasta atual"
    warning "Criando docker/vps/.env a partir de docker/vps/.env.example"
    cp "$PROJECT_DIR/docker/vps/.env.example" "$PROJECT_DIR/docker/vps/.env"
    warning "Edite $PROJECT_DIR/docker/vps/.env antes do deploy"
  fi
fi

log "Configurando permissões dos scripts..."
chmod +x \
  "$PROJECT_DIR/scripts/deploy-vps-build.sh" \
  "$PROJECT_DIR/scripts/deploy-vps-build-registry.sh" \
  "$PROJECT_DIR/scripts/deploy-vps-stack.sh" \
  "$PROJECT_DIR/scripts/deploy-vps-lib.sh"

cd "$PROJECT_DIR"
CURRENT_BRANCH="$(git branch --show-current)"
cd ..

echo ""
echo "========================================="
echo -e "${GREEN}   Setup concluído com sucesso!${NC}"
echo "========================================="
echo ""
echo "Informações:"
echo "  - Branch: $CURRENT_BRANCH"
echo "  - Diretório: $PROJECT_DIR/"
echo ""
echo "Próximos passos:"
echo "  1. cd $PROJECT_DIR"
echo "  2. Editar docker/vps/.env"
echo "  3. sudo ./scripts/deploy-vps-build.sh $CURRENT_BRANCH"
echo "  4. sudo ./scripts/deploy-vps-stack.sh --infra"
echo ""
echo "Comandos úteis:"
echo "  - Build + push registry: sudo ./scripts/deploy-vps-build-registry.sh $CURRENT_BRANCH"
echo "  - Ver imagens: docker images | grep paperclip"
echo "  - Ver stack: docker stack services paperclip"
echo ""
log "Setup finalizado!"
