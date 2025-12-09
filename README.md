<p align="center">
  <img src="logo.png" alt="Stepifi Logo" width="900">
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
- 👁️ **3D Preview** — Inspect your STL in-browser with Three.js before converting
- 🔧 **Automatic Mesh Repair** — Fixes non-manifold edges, holes, duplicate vertices, and inconsistent normals
- ⚙️ **Adjustable Tolerance** — Control the precision of edge merging (trade accuracy for speed)
- 📦 **Batch Processing** — Upload and convert multiple files at once
- 📊 **Job Queue Dashboard** — Monitor conversion progress with Bull Board
- 🧹 **Auto Cleanup** — Files automatically expire and are deleted after 24 hours (configurable)
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
```

That's it. Open your browser to `http://localhost:3000`

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
| FreeCAD (headless) | STL → STEP conversion engine |
| Python 3 + NumPy | Mesh processing operations |
| Express.js | Web server and API |
| BullMQ | Job queue management |

### Exposed Ports

| Port | Service | URL |
|------|---------|-----|
| `3000` | Main web interface | `http://localhost:3000` |
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

Navigate to `http://localhost:3000` (or your server's IP/domain).

### Step 2: Upload an STL File

- **Drag and drop** an STL file onto the upload zone, OR
- **Click** the upload zone to browse for a file

Multiple files can be uploaded for batch processing.

### Step 3: Configure Conversion Settings (Optional)

| Setting | Description | Default |
|---------|-------------|---------|
| **Tolerance** | Edge merging precision. Lower = more accurate but slower. Higher = faster but less precise. | `0.01` |
| **Repair Mesh** | Attempts to fix common mesh issues (holes, bad normals, non-manifold edges) before conversion. | `Enabled` |

### Step 4: Preview Your Model

Once uploaded, a 3D preview appears showing:
- Interactive view (drag to rotate, scroll to zoom)
- Vertex count
- Face count  
- File size

Use the toolbar buttons to reset the view or toggle wireframe mode.

### Step 5: Monitor Conversion Progress

Each uploaded file creates a job card showing:
- **Status**: Queued → Processing → Completed (or Failed)
- **Progress bar**: Visual progress indicator
- **Time remaining**: Countdown until auto-deletion

### Step 6: Download Your STEP File

Once status shows **Completed**, click the green **Download STEP** button.

The file will download with the same name as your original STL, but with a `.step` extension.

---

## Monitoring and Administration

### Job Queue Dashboard

Access detailed job information at `http://localhost:3001/admin/queues`

This shows:
- Active, waiting, and completed jobs
- Failed jobs with error details
- Job processing times
- Queue health metrics

### Health Check

Click the **heartbeat icon** (💓) in the header to verify system status:
- Redis connection
- FreeCAD availability
- Current configuration

Or via API:
```bash
curl http://localhost:3000/health
```

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

---

## Manual Installation (Without Docker)

### Prerequisites

- Node.js 18+
- Redis server
- FreeCAD with CLI (`freecadcmd`)

### Install FreeCAD

**Ubuntu/Debian:**
```bash
sudo apt-get update && sudo apt-get install freecad
```

**macOS:**
```bash
brew install freecad
```

**Windows:** Download from [freecadweb.org](https://www.freecadweb.org/downloads.php)

### Run the Application

```bash
# Install dependencies
npm install

# Start Redis (separate terminal)
redis-server

# Start the app
npm start

# Or for development with auto-reload
npm run dev
```

---

## API Reference

### Convert a File

```bash
curl -X POST http://localhost:3000/api/convert \
  -F "stlFile=@model.stl" \
  -F "tolerance=0.01" \
  -F "repair=true"
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid-here",
  "message": "Conversion job queued"
}
```

### Check Job Status

```bash
curl http://localhost:3000/api/job/{jobId}
```

### Download Converted File

```bash
curl -O http://localhost:3000/api/download/{jobId}
```

### Delete a Job

```bash
curl -X DELETE http://localhost:3000/api/job/{jobId}
```

---

## Troubleshooting

### Container won't start
```bash
docker-compose logs app
docker-compose logs redis
```

### "FreeCAD not found" error
```bash
docker-compose build --no-cache
docker-compose up -d
```

### Conversion times out
- Use a higher tolerance value (e.g., `0.05`)
- Simplify the mesh in MeshLab before uploading
- Increase Docker memory allocation

### Files disappearing
Files auto-delete after `JOB_TTL_HOURS` (default 24 hours). Download promptly or increase the TTL.

---

## Project Structure

```
Stepifi/
├── docker-compose.yml       # Container orchestration
├── Dockerfile               # App container build
├── package.json             # Dependencies
├── src/
│   ├── server.js            # Express entry point
│   ├── config/              # Configuration
│   ├── routes/              # API endpoints
│   ├── services/            # Business logic
│   │   ├── converter.service.js   # FreeCAD integration
│   │   ├── queue.service.js       # Job queue
│   │   ├── cleanup.service.js     # Auto-cleanup
│   │   └── ...
│   └── scripts/
│       └── convert.py       # FreeCAD Python script
└── public/
    ├── index.html           # Web UI
    ├── css/style.css        # Styles
    └── js/app.js            # Frontend + Three.js
```

---

## License

MIT License — free for personal and commercial use.

---

## Acknowledgments

- [FreeCAD](https://www.freecadweb.org/) — Open-source CAD
- [Three.js](https://threejs.org/) — 3D visualization
- [BullMQ](https://docs.bullmq.io/) — Job queue
- Inspired by [Jaydenha09/STL-to-STEP-web-converter](https://github.com/Jaydenha09/STL-to-STEP-web-converter)
