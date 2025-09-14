#!/bin/bash

# Pantry to Plate - Automated Setup Script
# Run this from the root directory of the project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default OpenAI API Key
DEFAULT_OPENAI_KEY="sk-proj-REPLACE_ME"

print_header() {
    echo -e "${BLUE}"
    echo "🍳 =============================================="
    echo "   Pantry to Plate - Automated Setup"
    echo "   AI-Powered Recipe Generation App"
    echo "===============================================${NC}"
    echo
}

print_step() {
    echo -e "${YELLOW}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

check_prerequisites() {
    print_step "Checking prerequisites..."
    
    if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
        print_error "Python is not installed. Please install Python 3.8 or higher."
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 16 or higher."
        exit 1
    fi
    
    if command -v yarn &> /dev/null; then
        PACKAGE_MANAGER="yarn"
    elif command -v npm &> /dev/null; then
        PACKAGE_MANAGER="npm"
    else
        print_error "Neither yarn nor npm is installed."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
    print_info "Using package manager: $PACKAGE_MANAGER"
    echo
}

setup_backend() {
    print_step "Setting up backend..."
    
    cd backend
    
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
        PIP_CMD="pip3"
    else
        PYTHON_CMD="python"
        PIP_CMD="pip"
    fi
    
    if [ ! -d "venv" ]; then
        print_info "Creating Python virtual environment..."
        $PYTHON_CMD -m venv venv
    fi
    
    print_info "Activating virtual environment..."
    source venv/bin/activate || { print_error "Failed to activate venv. Ensure you're on macOS/Linux."; exit 1; }
    
    print_info "Upgrading pip..."
    $PYTHON_CMD -m pip install --upgrade pip
    
    print_info "Installing emergentintegrations library..."
    $PIP_CMD install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
    
    if [ -f "requirements.txt" ]; then
        print_info "Installing Python dependencies..."
        $PIP_CMD install -r requirements.txt
    else
        print_error "requirements.txt not found in backend directory"
        exit 1
    fi
    
    if [ ! -f ".env" ]; then
        print_info "Creating backend .env file..."
        cat > .env << EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="recipes_database"
CORS_ORIGINS="http://localhost:3000"
OPENAI_API_KEY="$DEFAULT_OPENAI_KEY"
EOF
        print_success "Backend .env file created"
    else
        print_info "Backend .env file already exists"
    fi
    
    cd ..
    print_success "Backend setup completed"
    echo
}

setup_frontend() {
    print_step "Setting up frontend..."
    
    cd frontend
    
    print_info "Installing frontend dependencies..."
    if [ "$PACKAGE_MANAGER" = "yarn" ]; then
        yarn install
    else
        npm install
    fi
    
    if [ ! -f ".env" ]; then
        print_info "Creating frontend .env file..."
        cat > .env << EOF
REACT_APP_BACKEND_URL=http://localhost:8001
EOF
        print_success "Frontend .env file created"
    else
        print_info "Frontend .env file already exists"
    fi
    
    cd ..
    print_success "Frontend setup completed"
    echo
}

check_mongodb() {
    print_step "Checking MongoDB setup..."
    
    if command -v mongod &> /dev/null; then
        print_success "MongoDB is installed locally"
        print_info "Make sure to start MongoDB with: mongod"
    else
        print_info "MongoDB not found locally"
        print_info "You can either:"
        print_info "1. Install MongoDB Community Edition from https://www.mongodb.com/try/download/community"
        print_info "2. Use MongoDB Atlas (cloud) at https://www.mongodb.com/atlas"
        print_info "   If using Atlas, update MONGO_URL in backend/.env"
    fi
    echo
}

create_helper_scripts() {
    print_step "Creating helper scripts..."
    
    # Create start.sh
    cat > start.sh << 'EOF'
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
EOF
    
    chmod +x start.sh
    
    # Create stop.sh
    cat > stop.sh << 'EOF'
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
EOF
    
    chmod +x stop.sh
    
    # Create test.sh
    cat > test.sh << 'EOF'
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
EOF
    
    chmod +x test.sh
    
    # Create dev.sh for development
    cat > dev.sh << 'EOF'
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
EOF
    
    chmod +x dev.sh
    
    print_success "Helper scripts created"
    echo
}

main() {
    print_header
    
    echo -e "${YELLOW}🔑 OpenAI API Key Setup${NC}"
    echo "A default OpenAI API key is provided, but you can use your own."
    read -p "Enter your OpenAI API key (or press Enter to use default): " USER_OPENAI_KEY
    
    if [ ! -z "$USER_OPENAI_KEY" ]; then
        DEFAULT_OPENAI_KEY="$USER_OPENAI_KEY"
        print_success "Using your OpenAI API key"
    else
        print_info "Using default OpenAI API key"
    fi
    echo
    
    check_prerequisites
    setup_backend
    setup_frontend
    check_mongodb
    create_helper_scripts
    
    print_header
    print_success "🎉 Setup completed successfully!"
    echo
    print_info "Next steps:"
    echo "1. Start MongoDB: mongod (if using local installation)"
    echo "2. Start the application: ./start.sh"
    echo "3. Open browser to: http://localhost:3000"
    echo "4. Test the setup: ./test.sh"
    echo
    print_info "Available commands:"
    echo "• ./start.sh    - Start both servers"
    echo "• ./stop.sh     - Stop all servers"
    echo "• ./test.sh     - Test the application"
    echo "• ./dev.sh      - Development menu"
    echo
    echo -e "${GREEN}Happy cooking! 🍳✨${NC}"
}

main "$@"
