#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 2
fi

SSH_PORT="${SSH_PORT:-22}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/ai-crm}"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y   ca-certificates   curl   jq   nginx   certbot   python3-certbot-nginx   postgresql-client   ufw   fail2ban   unattended-upgrades   docker.io   docker-compose-v2

systemctl enable --now docker
systemctl enable --now nginx
systemctl enable --now fail2ban

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
mkdir -p "$DEPLOY_ROOT"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_ROOT"
chmod 750 "$DEPLOY_ROOT"

ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "VPS base hardening complete."
echo "Next: add the deployment SSH public key for $DEPLOY_USER, create $DEPLOY_ROOT/.env.production, install the Nginx site, then activate TLS/Cloudflare."
