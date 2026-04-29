#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# entrypoint.sh — starts the API server and nginx inside the container.
#
# Environment variables are supplied by Docker at runtime:
#   docker run --env-file .env -p 3000:3000 <image>
#
# The script:
#   1. Optionally rewrites the nginx listen port from $NGINX_PORT.
#   2. Starts the API server on internal port 8080.
#   3. Starts nginx in the foreground (main process).
#
# Signals sent to PID 1 are forwarded to both child processes.
# ---------------------------------------------------------------------------

API_PORT=8080
NGINX_PORT="${NGINX_PORT:-3000}"

# Rewrite the nginx listen port if NGINX_PORT differs from the default (3000)
if [ "$NGINX_PORT" != "3000" ]; then
    sed -i "s/listen       3000;/listen       ${NGINX_PORT};/g; \
            s/listen       \[::\]:3000;/listen       [::]:${NGINX_PORT};/g" \
        /etc/nginx/sites-available/default
fi

echo "[entrypoint] Starting API server on internal port ${API_PORT}..."
PORT="${API_PORT}" node --enable-source-maps /app/api-server/dist/index.mjs &
API_PID=$!

echo "[entrypoint] Waiting for API server to be ready..."
for i in $(seq 1 30); do
    if wget -qO- "http://127.0.0.1:${API_PORT}/api/healthz" >/dev/null 2>&1; then
        echo "[entrypoint] API server is ready."
        break
    fi
    sleep 1
done

echo "[entrypoint] Starting nginx on port ${NGINX_PORT}..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Forward SIGTERM / SIGINT to both child processes so the container shuts down
# cleanly.
_term() {
    echo "[entrypoint] Caught signal — shutting down..."
    kill "$API_PID"   2>/dev/null || true
    kill "$NGINX_PID" 2>/dev/null || true
}
trap _term TERM INT

# Wait for either process to exit; if one dies the container stops.
wait "$API_PID"
wait "$NGINX_PID"
