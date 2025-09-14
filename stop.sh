#!/bin/bash

echo "🛑 Stopping Pantry to Plate servers..."

if [ -f "backend.pid" ]; then
    kill $(cat backend.pid) 2>/dev/null
    rm -f backend.pid
    echo "✅ Backend stopped"
fi

if [ -f "frontend.pid" ]; then
    kill $(cat frontend.pid) 2>/dev/null
    rm -f frontend.pid
    echo "✅ Frontend stopped"
fi

# Kill any remaining processes
pkill -f "uvicorn server:app" 2>/dev/null || true
pkill -f "react-scripts start" 2>/dev/null || true
pkill -f "npm start" 2>/dev/null || true
pkill -f "yarn start" 2>/dev/null || true

echo "🏁 All servers stopped"
