# UtilityFlow Server — Production Dockerfile
# Compatible with Sevalla, Railway, Render, Fly.io, and any Docker-based PaaS

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Build the server bundle
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Production image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed for production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Create a minimal package.json with type:module to avoid ESM warning
RUN node -e "const p=require('./package.json');p.type='module';delete p.devDependencies;delete p.scripts;require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2))"

# Sevalla injects PORT env var at runtime — do NOT hardcode a port
# EXPOSE is informational only; Sevalla routes traffic to $PORT
EXPOSE 3000

# Health check for Sevalla readiness/liveness probes
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["node", "dist/index.js"]
