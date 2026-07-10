#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/usr/local/seo_monitor_web}"
if [ -f "$(dirname "$0")/package.json" ]; then
  APP_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
fi

cd "$APP_DIR"
command -v node >/dev/null 2>&1 || { echo "error: Node.js 22+ is required" >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "error: pnpm is required" >&2; exit 1; }

NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
[ "$NODE_MAJOR" -ge 22 ] || { echo "error: Node.js 22+ is required (current: $(node -v))" >&2; exit 1; }
PNPM_VERSION=$(pnpm --version 2>/dev/null || true)
case "$PNPM_VERSION" in
  11.*) ;;
  *) echo "error: pnpm 11 is required (current: ${PNPM_VERSION:-unavailable}); rerun install.sh" >&2; exit 1 ;;
esac

pnpm install --frozen-lockfile
pnpm run build
echo "Build complete: $APP_DIR/dist"
