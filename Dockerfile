# =============================================================================
# Stage 1 — Builder
# Installs all workspace dependencies and compiles both services.
# =============================================================================
FROM node:24-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /workspace

# Copy workspace manifests first so dependency install is cached independently
# of source changes.
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./

# Copy package manifests for all workspace packages before install so pnpm can
# resolve the workspace graph without the full source tree.
COPY lib/api-spec/package.json          lib/api-spec/
COPY lib/api-client-react/package.json  lib/api-client-react/
COPY lib/api-zod/package.json           lib/api-zod/
COPY lib/db/package.json                lib/db/
COPY artifacts/api-server/package.json  artifacts/api-server/
COPY artifacts/broadcast/package.json   artifacts/broadcast/

RUN pnpm install --frozen-lockfile || pnpm install

# Copy root TypeScript config files — all package tsconfigs extend tsconfig.base.json
COPY tsconfig.base.json tsconfig.json ./

# Copy full source after install so the layer above is reused on code-only changes
COPY lib/       lib/
COPY artifacts/ artifacts/

# ---- Build the API server ------------------------------------------------
# esbuild bundles all workspace libs into a single self-contained bundle so no
# node_modules are needed at runtime.
RUN pnpm --filter @workspace/api-server run build

# ---- Build the broadcast frontend ----------------------------------------
# Vite reads PORT and BASE_PATH from the environment at build time.
# BASE_PATH=/ means assets are served from the web root.
ARG BASE_PATH=/
RUN PORT=3001 BASE_PATH=${BASE_PATH} pnpm --filter @workspace/broadcast run build

# =============================================================================
# Stage 2 — Production image
# Slim Node.js + nginx; no build tools, no pnpm, no source files.
# =============================================================================
FROM node:24-slim AS production

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# API server bundle (self-contained, no node_modules needed)
COPY --from=builder /workspace/artifacts/api-server/dist ./api-server/dist

# Broadcast static site
COPY --from=builder /workspace/artifacts/broadcast/dist/public ./broadcast/public

# Copy .env files — the entrypoint sources /app/.env at startup so all vars
# (DATABASE_URL, NODE_ENV, etc.) are available to the API server process.
# The glob ".env*" also matches .env.example, ensuring this COPY never fails
# when only the example file is present (e.g. in CI without real secrets).
# Variables already in the Docker environment always take precedence over .env.
COPY .env* /app/

COPY docker/nginx.conf   /etc/nginx/sites-available/default
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# ---------------------------------------------------------------------------
# Runtime environment variables
# Override any of these at runtime via:
#   docker run --env-file .env ...   (reads your root .env automatically)
#   docker run -e KEY=value ...
#
# Required (no defaults — the app will refuse to start without them):
#   DATABASE_URL    PostgreSQL connection string
#   SESSION_SECRET  Secret used to sign sessions
#
# Optional:
#   NODE_ENV        default: production
#   LOG_LEVEL       pino level — trace|debug|info|warn|error  (default: info)
#   NGINX_PORT      port nginx listens on inside the container (default: 3000)
#
# Note: The API server is always bound to internal port 8080.
# nginx proxies /api/* and /ws to it, so you only expose NGINX_PORT.
# ---------------------------------------------------------------------------
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV NGINX_PORT=3000

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
