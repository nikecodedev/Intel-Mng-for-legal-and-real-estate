#!/bin/bash
# Build and restart GEMS on VPS. Run from repo root: bash /var/gems/scripts/deploy-gems-vps.sh
# Ensures correct cwd so .next/prerender-manifest.json is found.
set -e
GEMS_ROOT="${GEMS_ROOT:-/var/gems}"
cd "$GEMS_ROOT"
echo "Stopping gems..."
pm2 stop gems 2>/dev/null || true
echo "Building GEMS..."
cd "$GEMS_ROOT/apps/gems"
npm run build
echo "Starting gems from $GEMS_ROOT..."
cd "$GEMS_ROOT"
pm2 start npm --name gems -- start --prefix apps/gems
pm2 save
echo "Done. Check: pm2 status && pm2 logs gems --lines 5"
