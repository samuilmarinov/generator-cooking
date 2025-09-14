#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🍳 Starting Pantry to Plate...${NC}"

start_backend() {
    echo -e "${GREEN}Starting backend server...${NC}"
    cd backend
    source venv/bin/activate
    uvicorn server:app --host 0.0.0.0 --port 8001 --reload &
    BACKEND_PID=$!
    cd ..
    echo "Backend PID: $BACKEND_PID"
    echo $BACKEND_PID > backend.pid
}

start_frontend() {
    echo -e "${GREEN}Starting frontend server...${NC}"
    cd frontend
    if command -v yarn &> /dev/null && [ -f "yarn.lock" ]; then
        yarn start &
    else
        npm start &
    fi
    FRONTEND_PID=$!
    cd ..
    echo "Frontend PID: $FRONTEND_PID"
    echo $FRONTEND_PID > frontend.pid
}

start_backend
sleep 3
start_frontend

echo
echo -e "${GREEN}🚀 Servers starting...${NC}"
echo "Backend: http://localhost:8001"
echo "Frontend: http://localhost:3000"
echo "API Docs: http://localhost:8001/docs"
echo
echo "Press Ctrl+C to stop all servers"

trap 'kill $(cat backend.pid frontend.pid 2>/dev/null) 2>/dev/null; rm -f backend.pid frontend.pid; exit' INT

wait
