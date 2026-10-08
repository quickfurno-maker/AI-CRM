#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 2
fi

WEB_DOMAIN="${WEB_DOMAIN:?WEB_DOMAIN is required}"
API_DOMAIN="${API_DOMAIN:?API_DOMAIN is required}"
ROOT="${DEPLOY_ROOT:-/opt/ai-crm}"
TEMPLATE="$ROOT/infra/vps/nginx/ai-crm.conf.template"
TARGET="/etc/nginx/sites-available/ai-crm.conf"

test -f "$TEMPLATE"

sed   -e "s/__WEB_DOMAIN__/$WEB_DOMAIN/g"   -e "s/__API_DOMAIN__/$API_DOMAIN/g"   "$TEMPLATE" > "$TARGET"

ln -sfn "$TARGET" /etc/nginx/sites-enabled/ai-crm.conf
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo "Nginx site installed for $WEB_DOMAIN and $API_DOMAIN."
echo "Final external activation: obtain TLS certificates, enable Cloudflare Full Strict, then restrict origin HTTP/HTTPS to Cloudflare."
