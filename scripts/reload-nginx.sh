#!/bin/bash
# Reload Nginx after editing config. Run: sudo bash /var/gems/scripts/reload-nginx.sh
sudo nginx -t && sudo systemctl reload nginx && echo "Nginx reloaded."
