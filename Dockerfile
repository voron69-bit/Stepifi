# Build stage for Node.js app
FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Production stage with FreeCAD
FROM debian:bookworm-slim

# Install FreeCAD, Python, Node.js, and utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    freecad \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for mesh operations
RUN pip3 install --break-system-packages numpy

WORKDIR /app

# Copy node modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create directories for uploads and converted files
RUN mkdir -p uploads converted logs \
    && chmod 777 uploads converted logs

# Create non-root user for security
RUN useradd -m -s /bin/bash appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 3000 3001

CMD ["node", "src/server.js"]
