#!/bin/bash
# RedGo production deploy. Copy to the server as ~/deploy.sh (chmod +x) and run ./deploy.sh
#
# Stops on the first failure, so a failed pull/install/build never wipes the live site
# or restarts the API on half-updated code.
set -euo pipefail

APP_DIR=~/redgo-v2
WEB_ROOT=/var/www/redgo-v2

# Never let two deploys (or a deploy and a leftover build) run at the same time.
exec 9>/tmp/redgo-deploy.lock
if ! flock -n 9; then
  echo "❌ Another deploy is already running. Wait for it, or check: ps aux | grep -E 'vite|npm'"
  exit 1
fi
if pgrep -f "vite build" >/dev/null; then
  echo "⚠️  A previous 'vite build' is still running (stuck/orphaned). Killing it..."
  pkill -f "vite build" || true
  sleep 2
fi

echo "🚀 Deploying..."
cd "$APP_DIR"

# npm on the server can rewrite the lockfiles; discard that so `git pull` never aborts.
git checkout -- Frontend/package-lock.json Backend/package-lock.json 2>/dev/null || true
git pull --ff-only origin main
echo "📌 Now at: $(git log -1 --oneline)"

# ---------- FRONTEND ----------
cd "$APP_DIR/Frontend"
echo "📦 Frontend: npm ci"
npm ci --no-audit --no-fund

echo "🏗️  Frontend: build"
rm -rf dist
NODE_OPTIONS="--max-old-space-size=3072" npm run build

if [ ! -f dist/index.html ]; then
  echo "❌ Build produced no dist/index.html — live site left untouched."
  exit 1
fi

# Swap in the new build in one step instead of rm -rf + cp on the live folder.
sudo rm -rf "${WEB_ROOT}.new" "${WEB_ROOT}.old"
sudo cp -r dist "${WEB_ROOT}.new"
if [ -d "$WEB_ROOT" ]; then sudo mv "$WEB_ROOT" "${WEB_ROOT}.old"; fi
sudo mv "${WEB_ROOT}.new" "$WEB_ROOT"
sudo rm -rf "${WEB_ROOT}.old"
echo "✅ Frontend live"

# ---------- BACKEND ----------
cd "$APP_DIR/Backend"
echo "📦 Backend: npm ci"
npm ci --no-audit --no-fund

pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

# Leave the lockfiles exactly as committed for the next pull.
cd "$APP_DIR"
git checkout -- Frontend/package-lock.json Backend/package-lock.json 2>/dev/null || true

echo "✅ Done"
