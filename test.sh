#!/bin/bash

echo "🧪 Testing Pantry to Plate..."

echo "Testing backend API..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/api/ 2>/dev/null || echo "000")

if [ "$response" = "200" ]; then
    echo "✅ Backend API is responding"
    
    if [ -f "backend_test.py" ]; then
        echo "Running comprehensive backend tests..."
        python backend_test.py
    fi
else
    echo "❌ Backend API is not responding (HTTP $response)"
    echo "Make sure the backend server is running with: ./start.sh"
fi

echo
echo "🌐 Frontend should be available at: http://localhost:3000"
echo "📚 API Documentation at: http://localhost:8001/docs"
