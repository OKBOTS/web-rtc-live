#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# entrypoint.sh — starts the API server and nginx inside the container.
#
# Environment variables are loaded from (in priority order):
#   1. Variables already in the environment (docker run -e / Koyeb dashboard)
#   2. /app/.env  (the root .env file copied into the image at build time,
#                  or mounted via -v $(pwd)/.env:/app/.env)
#
# Variables already present in the environment always win over .env values.
# ---------------------------------------------------------------------------

# ---- Load .env file -------------------------------------------------------
# Source /app/.env so DATABASE_URL and other vars are available to child
# processes.  We use "set -a" so every assignment is automatically exported.
# Variables already set in the environment take precedence.
if [ -f /app/.env ]; then
    echo "[entrypoint] Loading /app/.env..."
    # Read each line; skip comments and blanks; only set if not already set
    while IFS= read -r line || [ -n "$line" ]; do
        # Strip leading/trailing whitespace
        line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        # Skip blank lines and comments
        case "$line" in
            ''|\#*) continue ;;
        esac
        # Extract key and value
        key="${line%%=*}"
        value="${line#*=}"
        # Only export if not already set in the environment
        eval "current=\${${key}+x}"
        if [ -z "$current" ]; then
            export "$key=$value"
        fi
    done < /app/.env
fi

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
