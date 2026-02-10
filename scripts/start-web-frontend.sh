#!/bin/bash

# Start Web Frontend for Testing
# This script starts the Next.js web application

set -e

echo "🌐 Starting Web Frontend"
echo "========================"
echo ""

cd "$(dirname "$0")/../apps/web" || exit 1

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Set API URL if not set
if [ -z "$NEXT_PUBLIC_API_URL" ]; then
    export NEXT_PUBLIC_API_URL="http://localhost:3000"
    echo "ℹ️  Using default API URL: $NEXT_PUBLIC_API_URL"
    echo "   (Set NEXT_PUBLIC_API_URL to change)"
fi

echo ""
echo "🚀 Starting Next.js development server..."
echo "   Web UI will be available at: http://localhost:3001"
echo "   API is at: http://localhost:3000"
echo ""
echo "   Press Ctrl+C to stop"
echo ""

npm run dev -- -p 3001
