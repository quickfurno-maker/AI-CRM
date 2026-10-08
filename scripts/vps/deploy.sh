#!/usr/bin/env bash
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/ai-crm}"
ENV_FILE="${PRODUCTION_ENV_FILE:-$ROOT/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/compose.production.yml}"
RELEASE_DIR="$ROOT/.release"

if [[ -z "${IMAGE_TAG:-}" ]]; then
  echo "IMAGE_TAG is required" >&2
  exit 2
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production env file: $ENV_FILE" >&2
  exit 2
fi

mkdir -p "$RELEASE_DIR"
chmod 700 "$RELEASE_DIR"
chmod 600 "$ENV_FILE"

exec 9>"$RELEASE_DIR/deploy.lock"
flock -n 9 || { echo "Another deployment is already running." >&2; exit 3; }

PREVIOUS_TAG=""
if [[ -f "$RELEASE_DIR/current" ]]; then
  PREVIOUS_TAG="$(cat "$RELEASE_DIR/current")"
fi

compose() {
  IMAGE_TAG="$1" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "${@:2}"
}

echo "Deploying immutable image tag: $IMAGE_TAG"
echo "Running database migration before application rollout..."
compose "$IMAGE_TAG" --profile ops run --rm migrate

echo "Starting Redis, API, web, and worker..."
compose "$IMAGE_TAG" up -d redis api web worker

health_ok=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error "http://127.0.0.1:${API_BIND_PORT:-4000}/v1/health/ready" >/tmp/crm-ai-api-health.json     && curl --fail --silent --show-error "http://127.0.0.1:${WEB_BIND_PORT:-3000}/" >/dev/null     && compose "$IMAGE_TAG" ps --status running worker | grep -q worker; then
    health_ok=true
    break
  fi
  sleep 5
done

if [[ "$health_ok" != "true" ]]; then
  echo "New release failed health verification." >&2
  if [[ -n "$PREVIOUS_TAG" && "$PREVIOUS_TAG" != "$IMAGE_TAG" ]]; then
    echo "Rolling application containers back to $PREVIOUS_TAG" >&2
    compose "$PREVIOUS_TAG" up -d redis api web worker
  fi
  exit 1
fi

printf '%s
' "$IMAGE_TAG" > "$RELEASE_DIR/current"
if [[ -n "$PREVIOUS_TAG" && "$PREVIOUS_TAG" != "$IMAGE_TAG" ]]; then
  printf '%s
' "$PREVIOUS_TAG" > "$RELEASE_DIR/previous"
fi

compose "$IMAGE_TAG" ps
cat /tmp/crm-ai-api-health.json
docker image prune -f >/dev/null || true
echo "Deployment complete: $IMAGE_TAG"
