#!/usr/bin/env bash
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/ai-crm}"
ENV_FILE="${PRODUCTION_ENV_FILE:-$ROOT/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/compose.production.yml}"
IMAGE_TAG="${IMAGE_TAG:-}"

if [[ -z "$IMAGE_TAG" && -f "$ROOT/.release/current" ]]; then
  IMAGE_TAG="$(cat "$ROOT/.release/current")"
fi
if [[ -z "$IMAGE_TAG" ]]; then
  echo "Unable to resolve deployed IMAGE_TAG." >&2
  exit 2
fi

compose() {
  IMAGE_TAG="$IMAGE_TAG" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

curl --fail --silent --show-error "http://127.0.0.1:${API_BIND_PORT:-4000}/v1/health/live"
echo
curl --fail --silent --show-error "http://127.0.0.1:${API_BIND_PORT:-4000}/v1/health/ready"
echo
curl --fail --silent --show-error "http://127.0.0.1:${WEB_BIND_PORT:-3000}/" >/dev/null
compose ps
compose exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping'
echo "VPS production verification passed."
