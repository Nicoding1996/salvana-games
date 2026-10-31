FROM node:22-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# tini runs as PID 1 and passes the host's stop signal (SIGTERM) on to Node,
# which ignores it when it is PID 1 itself
RUN apk add --no-cache tini

# Copy built assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/public ./public

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
# One Node process with tsx loaded in-process. `npx tsx` adds npm and the tsx CLI
# as two more processes (about 100 MB more memory and twice the startup CPU)
CMD ["node", "--import", "tsx", "server.ts"]
