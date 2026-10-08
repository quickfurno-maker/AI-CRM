#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="${DEPLOY_ROOT:-/opt/ai-crm}"
ENV_FILE="${PRODUCTION_ENV_FILE:-$ROOT/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups/postgres}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production env file: $ENV_FILE" >&2
  exit 2
fi

set -a
source "$ENV_FILE"
set +a

DB_URL="${MIGRATION_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "MIGRATION_DATABASE_URL or DATABASE_URL is required." >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/crm-ai-$STAMP.dump"

pg_dump "$DB_URL"   --format=custom   --compress=9   --no-owner   --no-privileges   --file="$OUT"

pg_restore --list "$OUT" >/dev/null
sha256sum "$OUT" > "$OUT.sha256"
find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete

echo "Backup created and structurally verified: $OUT"
