<p align="center">
  <img src="public/logo.png" alt="Stepifi Logo" width="900">
</p>

A self-hosted web application that converts STL mesh files to STEP (ISO 10303) solid format. Built for makers, engineers, and 3D printing enthusiasts who need to work with CAD software that requires STEP files.

---

## What This Tool Does

**The Problem:** You download an STL file from Thingiverse, Printables, or another repository. You want to modify it in Fusion 360, SolidWorks, or FreeCAD — but those programs work best with STEP files, not meshes.

**The Solution:** This tool converts your STL files to STEP format through a simple drag-and-drop web interface. It runs entirely on your own hardware with no file size limits, no subscriptions, and no uploads to third-party servers.

### Important: Understanding the Conversion

This tool converts STL meshes to STEP format, but **it does not reverse-engineer parametric geometry**. Here's what that means:

| What You Get | What You Don't Get |
|--------------|-------------------|
| ✅ Valid STEP file importable into any CAD software | ❌ Editable features (fillets, chamfers, extrudes) |
| ✅ Solid body you can boolean with other geometry | ❌ Smooth curves (cylinders remain faceted) |
| ✅ Repaired mesh (holes filled, normals fixed) | ❌ Reduced file size |
| ✅ Ability to add new parametric features around it | ❌ Parametric editing history |

**This is still useful because** most CAD software handles STEP bodies better than raw meshes for boolean operations, sectioning, and adding new features on top of existing geometry.

---

## Features

- 🖱️ **Drag & Drop Interface** — Upload files with a simple drag-and-drop or file picker
- 👁️ **Real-Time 3D Preview** — Inspect your STL in-browser with Three.js before converting
- 🔧 **Automatic Mesh Repair** — Fixes non-manifold edges, holes, duplicate vertices, and inconsistent normals
- ⚙️ **Adjustable Tolerance** — Control the precision of edge merging (trade accuracy for speed)
- 📦 **Batch Processing** — Upload and convert multiple files at once
- ❌ **Job Cancellation** — Cancel queued or in-progress conversions
- 📊 **Job Queue Dashboard** — Monitor conversion progress with Bull Board
- 🧹 **Auto Cleanup** — Files automatically expire and are deleted after 24 hours (configurable)
- 💓 **Health Monitoring** — Built-in system health checks
- 🔒 **Self-Hosted** — Your files never leave your network
- 🐳 **Docker Ready** — One-command deployment

---

## Quick Start with Docker

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed

### Installation
```bash
# Clone the repository
git clone https://github.com/voron69-bit/Stepifi.git
cd Stepifi

# Start the application
docker-compose up -d

# Check logs to verify startup
docker-compose logs -f
```

Wait until you see:
```
Redis connected
Server running on port 3000
```

Then open your browser to `http://localhost:3169`

---

## What the Docker Container Does

The Docker setup consists of two containers managed by Docker Compose:

| Container | Purpose |
|-----------|---------|
| **app** | Node.js application server + FreeCAD conversion engine |
| **redis** | Job queue storage and session management |

### The `app` Container Includes

| Component | Purpose |
|-----------|---------|
| Debian Bookworm | Base operating system |
| Node.js 20 | Application runtime |
| FreeCAD 0.21.2 (headless) | STL → STEP conversion engine |
| Python 3 + NumPy | Mesh processing operations |
| Express.js | Web server and API |
| BullMQ | Job queue management |

### Exposed Ports

| Port | Service | URL |
|------|---------|-----|
| `3000` | Main web interface | `http://localhost:3169` |
| `3001` | Job queue dashboard | `http://localhost:3001/admin/queues` |

### Persistent Volumes

| Volume | Purpose |
|--------|---------|
| `uploads` | Temporary storage for uploaded STL files |
| `converted` | Storage for converted STEP files |
| `redis_data` | Redis persistence (survives container restarts) |

---

## How to Access and Use

### Step 1: Open the Web Interface

Navigate to `http://localhost:3169` (or your server's IP/domain).

### Step 2: Upload an STL File

- **Drag and drop** an STL file onto the upload zone, OR
- **Click** the upload zone to browse for a file

Multiple files can be uploaded for batch processing.

### Step 3: Configure Conversion Settings (Optional)

Hover over the info icons (ⓘ) for detailed explanations.

| Setting | Description | Default |
|---------|-------------|---------|
| **Tolerance** | Edge merging precision. Lower = more accurate but slower. Higher = faster but less precise. | `0.01` |
| **Repair Mesh** | Attempts to fix common mesh issues (holes, bad normals, non-manifold edges) before conversion. | `Enabled` |

### Step 4: Preview Your Model

A 3D preview appears immediately showing:
- Interactive view (drag to rotate, scroll to zoom, right-click to pan)
- Vertex count
- Face count  
- File size

Use the toolbar buttons to:
- 🔄 Reset camera view
- ⊞ Toggle wireframe mode

### Step 5: Monitor Conversion Progress

Each uploaded file creates a job card showing:
- **Status**: Queued → Processing → Completed (or Failed)
- **Progress bar**: Visual progress indicator
- **Time remaining**: Countdown until auto-deletion (24 hours default)

**Job Controls:**
- **Cancel** — Stop queued or processing jobs
- **Download** — Get your STEP file when complete
- **Delete** — Remove job and files

### Step 6: Download Your STEP File

Once status shows **Completed**, click the green **Download STEP** button.

The file will download with the same name as your original STL, but with a `.step` extension.

---

## Monitoring and Administration

### Health Check

Click the **heartbeat icon** (💓) in the top-right header to verify system status:
- Overall system health
- Redis connection status
- FreeCAD availability
- FreeCAD version information

Or via API:
```bash
curl http://localhost:3169/health
```

**Response:**
```json
{
  "status": "healthy",
  "redis": true,
  "freecad": true,
  "freecadVersion": "FreeCAD 0.21.2, Libs: 0.21.2..."
}
```

### Job Queue Dashboard

Access detailed job information at `http://localhost:3001/admin/queues`

This shows:
- Active, waiting, and completed jobs
- Failed jobs with error details
- Job processing times
- Queue health metrics
- Retry information

---

## Configuration

### Environment Variables

Create a `.env` file or modify `docker-compose.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Web interface port |
| `BULL_BOARD_PORT` | `3001` | Queue dashboard port |
| `MAX_FILE_SIZE` | `104857600` | Max upload size in bytes (100MB) |
| `JOB_TTL_HOURS` | `24` | Hours before files auto-delete |
| `CLEANUP_CRON` | `*/15 * * * *` | Cleanup frequency (every 15 min) |
| `DEFAULT_TOLERANCE` | `0.01` | Default conversion tolerance |
| `RATE_LIMIT_MAX` | `20` | Max requests per 15 minutes |
| `MAX_CONCURRENT_JOBS` | `2` | Simultaneous conversions |

### Example: Increase File Size Limit to 500MB

In `docker-compose.yml`:
```yaml
environment:
  - MAX_FILE_SIZE=524288000
```

Then restart:
```bash
docker-compose down && docker-compose up -d
```

### Example: Custom Port Mapping

In `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"  # Access at http://localhost:8080
  - "8081:3001"  # Dashboard at http://localhost:8081
```

---

## API Reference

### Convert a File
```bash
curl -X POST http://localhost:3169/api/convert \
  -F "stlFile=@model.stl" \
  -F "tolerance=0.01" \
  -F "repair=true"
```

**Response:**
```json
{
  "success": true,
  "jobId": "e96d23f0-cdf5-42f3-b787-aaa70bb55ed2",
  "message": "Conversion job queued",
  "expiresAt": "2024-12-10T15:30:00.000Z"
}
```

### Check Job Status
```bash
curl http://localhost:3169/api/job/{jobId}
```

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "e96d23f0-cdf5-42f3-b787-aaa70bb55ed2",
    "status": "completed",
    "progress": 100,
    "message": "Conversion complete",
    "result": {
      "outputPath": "/app/converted/e96d23f0-cdf5-42f3-b787-aaa70bb55ed2.step",
      "facets": 19568,
      "outputSize": 14308580
    },
    "expiresIn": 86340
  }
}
```

### Download Converted File
```bash
curl -O http://localhost:3169/api/download/{jobId}
```

### Cancel/Delete a Job
```bash
curl -X DELETE http://localhost:3169/api/job/{jobId}
```

**Response:**
```json
{
  "success": true,
  "message": "Job deleted successfully"
}
```

---

## Troubleshooting

### Container won't start
```bash
# Check logs for errors
docker-compose logs app
docker-compose logs redis

# Rebuild containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### "FreeCAD not found" error
FreeCAD is baked into the Docker image. If you see this error:
```bash
docker-compose build --no-cache
docker-compose up -d
```

### Conversion fails or times out
- **Use a higher tolerance** value (e.g., `0.05` or `0.1`)
- **Simplify the mesh** in MeshLab or Blender before uploading
- **Increase Docker memory** allocation in Docker Desktop settings
- Check `docker-compose logs app` for specific Python errors

### Files disappearing
Files auto-delete after `JOB_TTL_HOURS` (default 24 hours). Download promptly or increase the TTL in `docker-compose.yml`.

### "429 Too Many Requests" error
The API has rate limiting enabled (20 requests per 15 minutes by default). Wait or increase `RATE_LIMIT_MAX` in environment variables.

### 3D preview not loading
- Hard refresh your browser (Ctrl+F5 or Cmd+Shift+R)
- Check browser console (F12) for JavaScript errors
- Ensure you're using a modern browser (Chrome, Firefox, Edge, Safari)

### Health check shows Redis disconnected
```bash
docker-compose restart redis
docker-compose restart app
```

---

## Development

### Local Development Without Docker

**Prerequisites:**
- Node.js 18+
- Redis server
- FreeCAD with CLI (`freecadcmd`)

**Install FreeCAD:**

**Ubuntu/Debian:**
```bash
sudo apt-get update && sudo apt-get install freecad
```

**macOS:**
```bash
brew install freecad
```

**Windows:** Download from [freecadweb.org](https://www.freecadweb.org/downloads.php)

**Run the Application:**
```bash
# Install dependencies
npm install

# Start Redis (separate terminal)
redis-server

# Start the app in development mode
npm run dev
```

### Project Structure
```
Stepifi/
├── docker-compose.yml       # Container orchestration
├── Dockerfile               # App container build
├── package.json             # Node.js dependencies
├── src/
│   ├── server.js            # Express entry point
│   ├── config/              
│   │   └── config.js        # Environment configuration
│   ├── routes/              
│   │   ├── api.routes.js    # API endpoints
│   │   └── health.routes.js # Health check
│   ├── services/            
│   │   ├── converter.service.js   # FreeCAD integration
│   │   ├── queue.service.js       # BullMQ job queue
│   │   ├── cleanup.service.js     # Auto-cleanup cron
│   │   └── storage.service.js     # File management
│   ├── middleware/          
│   │   ├── upload.middleware.js   # Multer file upload
│   │   └── rateLimiter.middleware.js  # Rate limiting
│   └── scripts/
│       └── convert.py       # FreeCAD Python conversion script
└── public/
    ├── index.html           # Main web UI
    ├── logo.png             # Application logo
    ├── css/
    │   └── style.css        # Styles
    └── js/
        └── app.js           # Frontend JavaScript + Three.js
```

### Making Changes

The Docker setup includes volume mounts for live development:
```yaml
volumes:
  - ./src:/app/src              # Live source code updates
  - ./public:/app/public        # Live frontend updates
```

Changes to JavaScript, HTML, or CSS are reflected immediately. Just refresh your browser.

For changes to `package.json`, `Dockerfile`, or `docker-compose.yml`:
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

---

## Security Considerations

- **Rate Limiting**: Enabled by default (20 requests per 15 minutes)
- **File Size Limits**: 100MB by default (configurable)
- **Auto-Cleanup**: Files expire after 24 hours
- **No Authentication**: This tool has no built-in authentication. If exposing to the internet, use a reverse proxy with authentication (nginx, Caddy, Traefik)
- **CORS**: Disabled by default. Enable only if needed for external integrations.

### Recommended Production Setup
```bash
# Use behind a reverse proxy with HTTPS
# Example nginx config:

server {
    listen 443 ssl;
    server_name stepifi.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3169;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Performance Tips

### For Large Files
- Increase tolerance to `0.05` or `0.1`
- Disable mesh repair if the file is already clean
- Increase Docker memory allocation

### For Batch Processing
- Increase `MAX_CONCURRENT_JOBS` in environment variables
- Monitor system resources to avoid overload
- Consider adding more Redis workers

### Cleanup Optimization
- Default cleanup runs every 15 minutes
- Adjust `CLEANUP_CRON` if you need more frequent cleanup
- Monitor disk usage in the `uploads` and `converted` directories

---

## Known Limitations

- **No parametric data recovery**: Output is a solid body, not editable features
- **Faceted curves**: Cylinders and curved surfaces remain as triangle meshes
- **File size**: Very large files (>1GB) may cause memory issues
- **Processing time**: Complex models can take several minutes
- **Mesh quality**: Output quality depends heavily on input STL quality

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License — free for personal and commercial use.

See [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [FreeCAD](https://www.freecadweb.org/) — Open-source CAD platform
- [Three.js](https://threejs.org/) — WebGL 3D visualization
- [BullMQ](https://docs.bullmq.io/) — Redis-based job queue
- [Express.js](https://expressjs.com/) — Web framework
- Inspired by [Jaydenha09/STL-to-STEP-web-converter](https://github.com/Jaydenha09/STL-to-STEP-web-converter)

---

## Support

- **Issues**: [GitHub Issues](https://github.com/voron69-bit/Stepifi/issues)
- **Discussions**: [GitHub Discussions](https://github.com/voron69-bit/Stepifi/discussions)

---

**Made with ❤️ for the maker community**
