#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🔧 Development Mode${NC}"
echo "Choose what to run:"
echo "1. Backend only"
echo "2. Frontend only"
echo "3. Both (same as ./start.sh)"
echo "4. Backend tests"
echo "5. MongoDB (if installed locally)"

read -p "Enter choice (1-5): " choice

case $choice in
    1)
        echo -e "${GREEN}Starting backend only...${NC}"
        cd backend
        source venv/bin/activate
        uvicorn server:app --host 0.0.0.0 --port 8001 --reload
        ;;
    2)
        echo -e "${GREEN}Starting frontend only...${NC}"
        cd frontend
        if command -v yarn &> /dev/null && [ -f "yarn.lock" ]; then
            yarn start
        else
            npm start
        fi
        ;;
    3)
        echo -e "${GREEN}Starting both servers...${NC}"
        ./start.sh
        ;;
    4)
        echo -e "${GREEN}Running backend tests...${NC}"
        ./test.sh
        ;;
    5)
        echo -e "${GREEN}Starting MongoDB...${NC}"
        if command -v mongod &> /dev/null; then
            mongod
        else
            echo "❌ MongoDB not found. Please install it first."
        fi
        ;;
    *)
        echo "Invalid choice"
        ;;
esac
