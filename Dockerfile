# syntax=docker/dockerfile:1
#
# Multi-stage build: compile in a "build" stage that has dev tools, then copy
# only what's needed to run into a small "runtime" stage.
#   docker build -t prompt-lab .
#   docker run --env-file .env -p 3000:3000 prompt-lab
#
# One image, two processes: the API (default CMD) and the worker
# (`node dist/worker.js`). fly.toml runs both from this image.

# ── base: Debian slim + OpenSSL (Prisma's migration engine needs it) ─────────
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ── build: install everything, compile TypeScript, drop dev dependencies ─────
FROM base AS build
# Copy dependency manifests (and the Prisma schema, needed by `postinstall:
# prisma generate`) BEFORE the source code. Docker caches each layer, so
# `npm ci` only re-runs when dependencies change, not on every code edit.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

# ── runtime: just node_modules + compiled JS, running as a non-root user ─────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# package.json: read by GET /version. prisma/ + prisma.config.ts: needed by
# `prisma migrate deploy`, which runs as Fly's release command.
COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/prisma ./prisma

# Never run as root: a compromised process should own as little as possible.
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
