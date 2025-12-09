# Build stage for Node.js app
FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# Production stage with FreeCAD via conda
FROM mambaorg/micromamba:1.5-bookworm-slim

USER root

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

# Set up environment for FreeCAD
ENV PATH="/opt/conda/bin:$PATH"
ENV QT_QPA_PLATFORM=offscreen
ENV FREECAD_USER_HOME=/tmp

WORKDIR /app

# Copy node modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create directories for uploads and converted files
RUN mkdir -p uploads converted logs \
    && chmod 777 uploads converted logs

EXPOSE 3000 3001

# Run with micromamba environment activated
CMD ["/bin/bash", "-c", "micromamba run -n base node src/server.js"]
