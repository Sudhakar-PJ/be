# ==============================================================================
# STAGE 1: Builder (Compiles TypeScript & Builds Native Addons)
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools required to compile native C++ addons (Argon2)
RUN apk add --no-cache python3 make g++

# Copy dependency manifests first to leverage Docker layer caching
COPY package*.json tsconfig*.json ./

# Clean install all dependencies (including devDependencies for build)
RUN npm ci

# Copy application source code
COPY src/ ./src/

# Compile TypeScript to JavaScript (emits to /app/dist)
RUN npm run build

# Prune devDependencies to keep only production packages
RUN npm prune --omit=dev

# ==============================================================================
# STAGE 2: Production Runner (Lean, Unprivileged, Secure)
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Install dumb-init to handle PID 1 signal forwarding and zombie process reaping
RUN apk add --no-cache dumb-init

# Set production environment flags
ENV NODE_ENV=production
ENV PORT=4000

# Copy production node_modules from builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Copy compiled JavaScript dist output from builder
COPY --from=builder --chown=node:node /app/dist ./dist

# Copy package.json and raw SQL migrations
COPY --chown=node:node package*.json ./
COPY --chown=node:node migrations/ ./migrations/

# Switch from root to unprivileged built-in node user (Security Principle of Least Privilege)
USER node

# Expose HTTP port
EXPOSE 4000

# Use dumb-init as PID 1 entrypoint to ensure graceful shutdown signals are forwarded
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Launch production server
CMD ["node", "dist/index.js"]