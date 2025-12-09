# Build stage for Node.js app
FROM node:20-bookworm-slim AS builder

WORKDIR /build
COPY package*.json ./
RUN npm install --omit=dev

# Production stage with FreeCAD via conda
FROM mambaorg/micromamba:1.5-bookworm-slim

USER root
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
    libxrender1 \
    libxcursor1 \
    libxft2 \
    libxinerama1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install FreeCAD via micromamba
RUN micromamba install -y -n base -c conda-forge freecad=0.21.2 \
    && micromamba clean --all --yes

# Required for FreeCAD
ENV PATH="/opt/conda/bin:$PATH"
ENV QT_QPA_PLATFORM=offscreen
ENV FREECAD_USER_HOME=/tmp

# Copy node_modules from builder
COPY --from=builder /build/node_modules ./node_modules

# Copy backend
COPY src ./src
COPY package.json .

# Copy frontend
COPY public ./public
COPY logo.png .
COPY README.md .

# Create required folders
RUN mkdir -p uploads converted logs /tmp/runtime \
    && chmod 777 uploads converted logs \
    && chmod 700 /tmp/runtime

EXPOSE 3000 3001

CMD ["bash", "-c", "micromamba run -n base node src/server.js"]
