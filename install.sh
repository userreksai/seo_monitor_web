#!/bin/sh
set -eu

APP_DIR=/usr/local/seo_monitor_web
BACKEND_DIR=/usr/local/seo_monitor
REPOSITORY=https://github.com/userreksai/seo_monitor_web.git
SERVICE=seo-monitor-web
SERVICE_USER=seo-monitor-web
SERVICE_FILE=/etc/systemd/system/seo-monitor-web.service

log() { printf '\n==> %s\n' "$1"; }
fail() { printf 'error: %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "please run with sudo or as root"
command -v apt-get >/dev/null 2>&1 || fail "this installer currently supports Debian/Ubuntu (apt-get)"

log "Installing system dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git openssl

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || printf '0')
fi
if [ "$NODE_MAJOR" -lt 20 ] || ! command -v npm >/dev/null 2>&1; then
  log "Installing Node.js 20"
  NODE_SETUP=$(mktemp /tmp/nodesource-setup.XXXXXX.sh)
  trap 'rm -f "$NODE_SETUP"' EXIT INT TERM
  curl -fsSL https://deb.nodesource.com/setup_20.x -o "$NODE_SETUP"
  sh "$NODE_SETUP"
  apt-get install -y nodejs
  rm -f "$NODE_SETUP"
  trap - EXIT INT TERM
fi
if ! command -v pnpm >/dev/null 2>&1; then
  log "Installing pnpm 11"
  npm install --global pnpm@11.7.0
fi

log "Pulling source code into $APP_DIR"
PRESERVED_ENV=
if [ -f "$APP_DIR/.env" ]; then
  PRESERVED_ENV=$(mktemp /tmp/seo-monitor-web-env.XXXXXX)
  cp "$APP_DIR/.env" "$PRESERVED_ENV"
fi

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" diff --quiet || fail "$APP_DIR has uncommitted changes; preserve them before updating"
  git -C "$APP_DIR" diff --cached --quiet || fail "$APP_DIR has staged changes; preserve them before updating"
  git -C "$APP_DIR" fetch origin main
  git -C "$APP_DIR" checkout main
  git -C "$APP_DIR" merge --ff-only origin/main
elif [ -e "$APP_DIR" ]; then
  if [ -n "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
    BACKUP="${APP_DIR}.backup.$(date +%Y%m%d%H%M%S)"
    mv "$APP_DIR" "$BACKUP"
    log "Existing directory preserved at $BACKUP"
  else
    rmdir "$APP_DIR"
  fi
  git clone --branch main --single-branch "$REPOSITORY" "$APP_DIR"
else
  git clone --branch main --single-branch "$REPOSITORY" "$APP_DIR"
fi

if [ -n "$PRESERVED_ENV" ]; then
  cp "$PRESERVED_ENV" "$APP_DIR/.env"
  rm -f "$PRESERVED_ENV"
fi

log "Creating service account"
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

if [ ! -f "$APP_DIR/.env" ]; then
  BACKEND_TOKEN=
  if [ -f "$BACKEND_DIR/.env" ]; then
    BACKEND_TOKEN=$(sed -n 's/^API_TOKEN=//p' "$BACKEND_DIR/.env" | tail -n 1)
  fi
  [ -n "$BACKEND_TOKEN" ] || fail "cannot read API_TOKEN from $BACKEND_DIR/.env; create $APP_DIR/.env from .env.example first"
  WEB_PASSWORD=$(openssl rand -hex 12)
  {
    printf 'HOST=0.0.0.0\n'
    printf 'PORT=8889\n'
    printf 'BACKEND_API_URL=http://127.0.0.1:10001\n'
    printf 'BACKEND_API_TOKEN=%s\n' "$BACKEND_TOKEN"
    printf 'WEB_USERNAME=admin\n'
    printf 'WEB_PASSWORD=%s\n' "$WEB_PASSWORD"
  } > "$APP_DIR/.env"
  GENERATED_LOGIN=1
else
  GENERATED_LOGIN=0
fi

chown root:"$SERVICE_USER" "$APP_DIR/.env"
chmod 0640 "$APP_DIR/.env"

log "Installing frontend dependencies and building"
cd "$APP_DIR"
sh build.sh

log "Installing and starting systemd service"
install -m 0644 "$APP_DIR/deploy/seo-monitor-web.service" "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

log "Waiting for frontend health check"
HEALTHY=0
attempt=1
while [ "$attempt" -le 15 ]; do
  if curl -fsS --max-time 2 http://127.0.0.1:8889/frontend-health >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 1
  attempt=$((attempt + 1))
done
if [ "$HEALTHY" -ne 1 ]; then
  systemctl status "$SERVICE" --no-pager || true
  journalctl -u "$SERVICE" -n 60 --no-pager || true
  fail "frontend health check failed"
fi

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
printf '\nInstallation complete.\n'
printf 'URL: http://%s:8889\n' "${SERVER_IP:-SERVER_IP}"
if [ "$GENERATED_LOGIN" -eq 1 ]; then
  printf 'Username: admin\n'
  printf 'Password: %s\n' "$WEB_PASSWORD"
  printf 'Save this password now; it is stored in %s/.env.\n' "$APP_DIR"
else
  printf 'Existing login settings were preserved from %s/.env.\n' "$APP_DIR"
fi
printf 'Service: systemctl status %s\n' "$SERVICE"
printf 'Logs: journalctl -u %s -f\n' "$SERVICE"
