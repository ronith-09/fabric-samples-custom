#!/bin/bash

# FabCar Unified Startup Script
# Starts both backend (Node.js) and frontend (React) together

set -e

PROJECT_ROOT="/mnt/c/Users/HP/second/fabric-samples/fabcar"
BACKEND_DIR="$PROJECT_ROOT/javascript"
FRONTEND_DIR="$PROJECT_ROOT/app/frontend"

echo "================================================"
echo "🚀 FabCar Full Stack Startup"
echo "================================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backend is already running
check_backend() {
    if nc -z localhost 4000 2>/dev/null; then
        echo -e "${GREEN}✓ Backend already running on port 4000${NC}"
        return 0
    fi
    return 1
}

# Check if frontend is already running
check_frontend() {
    if nc -z localhost 3000 2>/dev/null; then
        echo -e "${GREEN}✓ Frontend already running on port 3000${NC}"
        return 0
    fi
    return 1
}

# Start backend
start_backend() {
    if check_backend; then
        return
    fi
    
    echo -e "${BLUE}Starting Backend...${NC}"
    cd "$BACKEND_DIR"
    PORT=4000 node server.js > /tmp/fabcar-backend.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > /tmp/fabcar-backend.pid
    echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"
    sleep 2
    
    # Verify backend health
    if curl -s http://localhost:4000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend health check passed${NC}"
    else
        echo -e "${YELLOW}⚠ Backend may not be ready yet${NC}"
    fi
}

# Start frontend
start_frontend() {
    if check_frontend; then
        return
    fi
    
    echo -e "${BLUE}Starting Frontend...${NC}"
    cd "$FRONTEND_DIR"
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing frontend dependencies...${NC}"
        yarn install
    fi
    
    yarn start > /tmp/fabcar-frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > /tmp/fabcar-frontend.pid
    echo -e "${GREEN}✓ Frontend starting (PID: $FRONTEND_PID)${NC}"
    echo -e "${YELLOW}  Frontend will be ready at http://localhost:3000${NC}"
}

# Stop services
stop_services() {
    echo -e "${BLUE}Stopping services...${NC}"
    
    if [ -f /tmp/fabcar-backend.pid ]; then
        BACKEND_PID=$(cat /tmp/fabcar-backend.pid)
        kill $BACKEND_PID 2>/dev/null || true
        rm -f /tmp/fabcar-backend.pid
        echo -e "${GREEN}✓ Backend stopped${NC}"
    fi
    
    if [ -f /tmp/fabcar-frontend.pid ]; then
        FRONTEND_PID=$(cat /tmp/fabcar-frontend.pid)
        kill $FRONTEND_PID 2>/dev/null || true
        rm -f /tmp/fabcar-frontend.pid
        echo -e "${GREEN}✓ Frontend stopped${NC}"
    fi
}

# Show logs
show_logs() {
    echo -e "${BLUE}Backend Logs:${NC}"
    tail -f /tmp/fabcar-backend.log &
    TAIL_PID=$!
    
    trap "kill $TAIL_PID" EXIT
    wait
}

# Show status
show_status() {
    echo -e "${BLUE}FabCar Service Status:${NC}"
    echo ""
    
    if check_backend; then
        echo -e "${GREEN}✓ Backend${NC} (http://localhost:4000)"
    else
        echo -e "${YELLOW}✗ Backend${NC} (not running)"
    fi
    
    if check_frontend; then
        echo -e "${GREEN}✓ Frontend${NC} (http://localhost:3000)"
    else
        echo -e "${YELLOW}✗ Frontend${NC} (not running)"
    fi
    
    echo ""
}

# Main logic
case "${1:-start}" in
    start)
        echo -e "${BLUE}Starting FabCar services...${NC}"
        start_backend
        start_frontend
        echo ""
        echo -e "${GREEN}================================================${NC}"
        echo -e "${GREEN}✓ All services started!${NC}"
        echo -e "${GREEN}================================================${NC}"
        echo ""
        echo -e "🌐 Frontend:  ${BLUE}http://localhost:3000${NC}"
        echo -e "🔌 Backend:   ${BLUE}http://localhost:4000/api${NC}"
        echo ""
        echo "Press Ctrl+C to stop all services"
        echo ""
        show_status
        
        # Keep script running
        wait
        ;;
    stop)
        stop_services
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    restart)
        stop_services
        sleep 1
        $0 start
        ;;
    *)
        echo "Usage: $0 {start|stop|status|logs|restart}"
        exit 1
        ;;
esac
