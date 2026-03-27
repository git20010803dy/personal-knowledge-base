#!/bin/bash
echo "Starting Personal Knowledge Base..."
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi
echo ""
echo "Starting services..."
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""
pnpm dev
