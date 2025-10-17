# Multi-stage build for optimal image size
FROM oven/bun:1.3.0 AS zig-builder

# Install Zig
RUN apt-get update && apt-get install -y wget xz-utils && \
    wget https://ziglang.org/download/0.13.0/zig-linux-x86_64-0.13.0.tar.xz && \
    tar -xf zig-linux-x86_64-0.13.0.tar.xz && \
    mv zig-linux-x86_64-0.13.0 /usr/local/zig && \
    ln -s /usr/local/zig/zig /usr/local/bin/zig && \
    rm zig-linux-x86_64-0.13.0.tar.xz

WORKDIR /app/packages/chess

# Copy Zig source files
COPY packages/chess/src/ ./src/
COPY packages/chess/build.zig ./
COPY packages/chess/build.zig.zon ./

# Build WASM
RUN zig build

# Build stage for client TypeScript
FROM oven/bun:1.3.0 AS web-builder

WORKDIR /app

# Copy workspace config
COPY package.json ./

# Copy web app source
COPY apps/web/ ./apps/web/

# Install dependencies and build client
RUN bun install
RUN bun build apps/web/src/main.ts --outfile=dist/web/app.js --target=browser

# Final production stage
FROM oven/bun:1.3.0-slim

WORKDIR /app

# Copy built artifacts
COPY --from=zig-builder /app/packages/chess/zig-out/bin/quantum-chess.wasm ./dist/wasm/
COPY --from=web-builder /app/dist/web/ ./dist/web/

# Copy runtime files
COPY apps/web/public/ ./apps/web/public/
COPY apps/server/ ./apps/server/
COPY package.json ./

# Install production dependencies only
RUN bun install --production

# Create volume for SQLite database
VOLUME ["/app/data"]

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/quantum-chess.db

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

# Run server
CMD ["bun", "run", "apps/server/src/index.ts"]
