#!/bin/bash
# Run on VPS from repo root: sudo bash /var/gems/scripts/setup-nginx-vps.sh
# Disables default Nginx site, enables GEMS config, reloads Nginx.
set -e
GEMS_ROOT="${GEMS_ROOT:-/var/gems}"
cp "$GEMS_ROOT/infrastructure/nginx/gems.conf" /etc/nginx/sites-available/gems
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/gems /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
echo "Nginx updated and reloaded."
