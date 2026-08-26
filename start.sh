#!/bin/bash
# SIH26033 - AgriConnect Platform Start Script

echo "Starting AgriConnect Platform..."

# Start backend
echo "Starting backend server on port 5001..."
cd "$(dirname "$0")/backend"
nohup node server.js > /tmp/sih-backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Start frontend
echo "Starting frontend on port 5173..."
cd "$(dirname "$0")/frontend"
nohup npx vite --host > /tmp/sih-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

sleep 3

echo ""
echo "============================================"
echo "AgriConnect Platform is running!"
echo "============================================"
echo ""
echo "Frontend:  http://localhost:5173"
echo "Backend:   http://localhost:5001"
echo "Health:    http://localhost:5001/health"
echo ""
echo "Test Credentials:"
echo "  Farmer: ramesh@farmer.com / password123"
echo "  Buyer:  bigbasket@buyer.com / password123"
echo "  Admin:  admin@sih26033.com / password123"
echo ""
echo "Logs:"
echo "  Backend:  tail -f /tmp/sih-backend.log"
echo "  Frontend: tail -f /tmp/sih-frontend.log"
echo ""
echo "Press Ctrl+C to stop all services"
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Services stopped'" EXIT
wait
