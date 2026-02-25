#!/bin/bash
# Quick tunnel setup for client demos

set -e

echo "=========================================="
echo "  CLIENT DEMO TUNNEL SETUP"
echo "=========================================="
echo ""

# Check if services are running
if ! docker compose -f infrastructure/docker/docker-compose.yml ps api | grep -q "healthy\|Up"; then
    echo "⚠️  Warning: API service doesn't appear to be running"
    echo "   Start services first: docker compose -f infrastructure/docker/docker-compose.yml up -d"
    echo ""
fi

# Check for tunneling tools
if command -v ngrok &> /dev/null; then
    echo "✓ Found ngrok"
    echo ""
    echo "Starting ngrok tunnel..."
    echo "API will be available at the public URL shown below"
    echo "Share this URL with the client"
    echo ""
    ngrok http 3000
elif command -v cloudflared &> /dev/null; then
    echo "✓ Found Cloudflare Tunnel"
    echo ""
    echo "Starting Cloudflare tunnel..."
    cloudflared tunnel --url http://localhost:3000
elif command -v lt &> /dev/null; then
    echo "✓ Found localtunnel"
    echo ""
    echo "Starting localtunnel..."
    lt --port 3000
else
    echo "❌ No tunneling tool found"
    echo ""
    echo "Install one of these:"
    echo "  1. ngrok: https://ngrok.com/download"
    echo "  2. Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
    echo "  3. localtunnel: npm install -g localtunnel"
    echo ""
    exit 1
fi
