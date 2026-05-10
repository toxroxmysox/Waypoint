# Stage 1: Build SvelteKit
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: Production image
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip debian-keyring debian-archive-keyring apt-transport-https \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update && apt-get install -y --no-install-recommends caddy \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Download PocketBase Linux AMD64
ARG PB_VERSION=0.27.2
RUN curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
    -o /tmp/pocketbase.zip \
    && unzip /tmp/pocketbase.zip -d /app/backend \
    && rm /tmp/pocketbase.zip \
    && chmod +x /app/backend/pocketbase

# Copy PocketBase hooks and migrations
COPY backend/pb_hooks /app/backend/pb_hooks
COPY backend/pb_migrations /app/backend/pb_migrations

# Copy SvelteKit build output + production deps
COPY --from=builder /app/build /app/build
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules

# Copy deploy files
COPY deploy/start.sh /app/start.sh
COPY deploy/Caddyfile /etc/caddy/Caddyfile
RUN chmod +x /app/start.sh

# PocketBase data lives on a persistent volume mounted at /data
ENV PB_DATA_DIR=/data

# Caddy listens on 8080 (Fly-facing port)
EXPOSE 8080

CMD ["/app/start.sh"]
