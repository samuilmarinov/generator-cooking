#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🗄️ MongoDB Setup Helper${NC}"
echo

if command -v mongod &> /dev/null; then
    echo -e "${GREEN}✅ MongoDB is installed${NC}"
    echo
    echo "Available options:"
    echo "1. Start MongoDB"
    echo "2. Stop MongoDB"
    echo "3. MongoDB status"
    echo "4. Connect to MongoDB shell"
    echo "5. View database"
    
    read -p "Enter choice (1-5): " choice
    
    case $choice in
        1)
            echo -e "${GREEN}Starting MongoDB...${NC}"
            mongod
            ;;
        2)
            echo -e "${YELLOW}Stopping MongoDB...${NC}"
            pkill -f mongod
            echo -e "${GREEN}MongoDB stopped${NC}"
            ;;
        3)
            echo -e "${BLUE}MongoDB status:${NC}"
            pgrep -f mongod && echo "✅ MongoDB is running" || echo "❌ MongoDB is not running"
            ;;
        4)
            echo -e "${GREEN}Opening MongoDB shell...${NC}"
            mongo
            ;;
        5)
            echo -e "${GREEN}Showing recipes database:${NC}"
            mongo --eval "use recipes_database; db.recipes.find().pretty()"
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            ;;
    esac
else
    echo -e "${RED}❌ MongoDB is not installed${NC}"
    echo
    echo "Install options:"
    echo "1. macOS: brew install mongodb-community"
    echo "2. Ubuntu: apt-get install mongodb"
    echo "3. Download from: https://www.mongodb.com/try/download/community"
    echo
    echo "Or use MongoDB Atlas (cloud):"
    echo "1. Go to https://www.mongodb.com/atlas"
    echo "2. Create free account and cluster"
    echo "3. Update MONGO_URL in backend/.env with connection string"
fi
