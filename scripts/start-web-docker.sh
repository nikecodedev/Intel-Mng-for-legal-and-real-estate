#!/bin/bash

# Start Web Frontend using Docker (No npm required on host)
# This runs the Next.js app in a Docker container

set -e

echo "🌐 Starting Web Frontend in Docker"
echo "===================================="
echo ""

cd "$(dirname "$0")/.." || exit 1

# Stop any existing web container
docker stop web-dev 2>/dev/null || true
docker rm web-dev 2>/dev/null || true

echo "📦 Starting Next.js in Docker container..."
echo "   Web UI will be available at: http://localhost:3001"
echo "   API should be at: http://localhost:3000"
echo ""
echo "   Press Ctrl+C to stop"
echo ""

# Run in Docker with volume mount for live development
docker run -it --rm \
  --name web-dev \
  -v "$(pwd):/workspace" \
  -w /workspace/apps/web \
  -p 3001:3001 \
  -e NEXT_PUBLIC_API_URL=http://host.docker.internal:3000 \
  node:18-alpine \
  sh -c "npm install && npm run dev -- -p 3001 --hostname 0.0.0.0"
