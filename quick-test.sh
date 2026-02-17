#!/bin/bash
set -e

echo "=========================================="
echo "  QUICK PROJECT TEST"
echo "=========================================="

cd /home/mickey/workstation/Intel-Mng-for-legal-and-real-estate

echo "1. Building images..."
docker compose -f infrastructure/docker/docker-compose.yml build

echo "2. Starting services..."
docker compose -f infrastructure/docker/docker-compose.yml up -d

echo "3. Waiting for services (30s)..."
sleep 30

echo "4. Checking service status..."
docker compose -f infrastructure/docker/docker-compose.yml ps

echo "5. Testing health endpoints..."
curl -s http://localhost:3000/health | jq -r '.status' && echo "✓ API healthy" || echo "✗ API unhealthy"
curl -s http://localhost:3000/health/db | jq -r '.status' && echo "✓ Database healthy" || echo "✗ Database unhealthy"
curl -s http://localhost:3000/health/redis | jq -r '.status' && echo "✓ Redis healthy" || echo "✗ Redis unhealthy"

echo "6. Testing API root..."
curl -s http://localhost:3000/ | jq -r '.success' && echo "✓ API responding" || echo "✗ API not responding"

echo ""
echo "=========================================="
echo "  TEST COMPLETE"
echo "=========================================="
