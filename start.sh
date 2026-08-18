#!/bin/sh
set -e

echo "Starting QualiMetrix application..."

# Start TanStack Start SSR server (configured to use port 3000 via nitro config)
echo "Starting TanStack Start SSR server on port 3000..."
node /app/dist/server/index.mjs &
FRONTEND_PID=$!

# Give frontend a moment to start
sleep 2

# Start Express API server on port 3001 (default)
echo "Starting Express API server on port 3001..."
npx tsx /app/src/api/server.ts &
API_PID=$!

# Function to handle shutdown
shutdown() {
    echo "Shutting down servers..."
    kill $FRONTEND_PID 2>/dev/null || true
    kill $API_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
    wait $API_PID 2>/dev/null || true
    exit 0
}

# Trap signals
trap shutdown SIGTERM SIGINT

echo "✅ Both servers started successfully"
echo "Frontend: http://localhost:3000"
echo "API: http://localhost:3001"

# Wait for both processes
wait $FRONTEND_PID $API_PID