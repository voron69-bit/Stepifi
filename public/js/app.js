/**
 * STL to STEP Converter - Frontend Application
 */

class STLConverter {
  constructor() {
    this.jobs = new Map();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.mesh = null;
    this.wireframeMode = false;
    
    this.init();
  }

  init() {
    this.bindElements();
    this.bindEvents();
    this.initThreeJS();
    this.loadJobsFromStorage();
  }

  bindElements() {
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.toleranceInput = document.getElementById('tolerance');
    this.toleranceValue = document.getElementById('toleranceValue');
    this.repairMeshCheckbox = document.getElementById('repairMesh');
    this.previewSection = document.getElementById('previewSection');
    this.previewContainer = document.getElementById('previewContainer');
    this.previewCanvas = document.getElementById('previewCanvas');
    this.resetViewBtn = document.getElementById('resetView');
    this.toggleWireframeBtn = document.getElementById('toggleWireframe');
    this.vertexCount = document.getElementById('vertexCount');
    this.faceCount = document.getElementById('faceCount');
    this.fileSize = document.getElementById('fileSize');
    this.jobsList = document.getElementById('jobsList');
    this.healthBtn = document.getElementById('healthBtn');
    this.healthModal = document.getElementById('healthModal');
    this.healthContent = document.getElementById('healthContent');
    this.toastContainer = document.getElementById('toastContainer');
  }

  bindEvents() {
    // Drop zone events
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    // Tolerance slider
    this.toleranceInput.addEventListener('input', () => {
      this.toleranceValue.textContent = this.toleranceInput.value;
    });

    // Preview controls
    this.resetViewBtn.addEventListener('click', () => this.resetCameraView());
    this.toggleWireframeBtn.addEventListener('click', () => this.toggleWireframe());

    // Health modal
    this.healthBtn.addEventListener('click', () => this.showHealthModal());
    this.healthModal.querySelector('.modal-close').addEventListener('click', () => {
      this.healthModal.classList.add('hidden');
    });
    this.healthModal.addEventListener('click', (e) => {
      if (e.target === this.healthModal) {
        this.healthModal.classList.add('hidden');
      }
    });

    // Window resize
    window.addEventListener('resize', () => this.handleResize());
  }

  // File handling
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this.dropZone.classList.add('drag-over');
  }

  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    this.dropZone.classList.remove('drag-over');
  }

  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.dropZone.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files).filter(f => 
      f.name.toLowerCase().endsWith('.stl')
    );
    
    if (files.length === 0) {
      this.showToast('Please drop STL files only', 'error');
      return;
    }
    
    this.processFiles(files);
  }

  handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      this.processFiles(files);
    }
    this.fileInput.value = '';
  }

  async processFiles(files) {
    // Preview the first file
    if (files.length > 0) {
      this.previewSTL(files[0]);
    }

    // Upload all files for conversion
    for (const file of files) {
      await this.uploadFile(file);
    }
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('stlFile', file);
    formData.append('tolerance', this.toleranceInput.value);
    formData.append('repair', this.repairMeshCheckbox.checked);

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        this.showToast(`Conversion started: ${file.name}`, 'success');
        this.addJob({
          id: data.jobId,
          filename: file.name,
          status: 'queued',
          progress: 0,
          expiresAt: data.expiresAt,
        });
        this.startPollingJob(data.jobId);
      } else {
        this.showToast(`Upload failed: ${data.error}`, 'error');
      }
    } catch (err) {
      this.showToast(`Upload error: ${err.message}`, 'error');
    }
  }

  // Job management
  addJob(job) {
    this.jobs.set(job.id, job);
    this.saveJobsToStorage();
    this.renderJobs();
  }

  updateJob(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
      this.saveJobsToStorage();
      this.renderJobs();
    }
  }

  removeJob(jobId) {
    this.jobs.delete(jobId);
    this.saveJobsToStorage();
    this.renderJobs();
  }

  async startPollingJob(jobId) {
    const poll = async () => {
      try {
        const response = await fetch(`/api/job/${jobId}`);
        const data = await response.json();

        if (data.success) {
          const job = data.job;
          this.updateJob(jobId, {
            status: job.status,
            progress: job.progress,
            message: job.message,
            result: job.result,
            error: job.error,
            expiresIn: job.expiresIn,
          });

          if (job.status === 'completed') {
            this.showToast('Conversion completed!', 'success');
            return;
          }

          if (job.status === 'failed') {
            this.showToast(`Conversion failed: ${job.error || 'Unknown error'}`, 'error');
            return;
          }

          // Continue polling
          setTimeout(poll, 1500);
        } else {
          this.updateJob(jobId, { status: 'failed', error: data.error });
        }
      } catch (err) {
        console.error('Polling error:', err);
        setTimeout(poll, 3000);
      }
    };

    poll();
  }

  renderJobs() {
    if (this.jobs.size === 0) {
      this.jobsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No active conversions</p>
        </div>
      `;
      return;
    }

    const jobsArray = Array.from(this.jobs.values()).reverse();
    
    this.jobsList.innerHTML = jobsArray.map(job => `
      <div class="job-card" data-job-id="${job.id}">
        <div class="job-header">
          <div class="job-info">
            <h4>${this.escapeHtml(job.filename)}</h4>
            <div class="job-meta">
              <span><i class="fas fa-clock"></i> ${this.formatTimeRemaining(job.expiresIn)}</span>
            </div>
          </div>
          <div class="job-status ${job.status}">
            ${this.getStatusIcon(job.status)}
            ${this.capitalizeFirst(job.status)}
          </div>
        </div>
        <div class="job-progress">
          <div class="job-progress-bar ${job.status}" style="width: ${job.progress}%"></div>
        </div>
        ${job.message ? `<div class="job-message ${job.error ? 'error' : ''}">${this.escapeHtml(job.message)}</div>` : ''}
        <div class="job-actions">
          ${job.status === 'completed' ? `
            <button class="btn btn-success btn-sm" onclick="app.downloadJob('${job.id}')">
              <i class="fas fa-download"></i> Download STEP
            </button>
          ` : ''}
          <button class="btn btn-ghost btn-sm" onclick="app.deleteJob('${job.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  async downloadJob(jobId) {
    window.location.href = `/api/download/${jobId}`;
  }

  async deleteJob(jobId) {
    try {
      await fetch(`/api/job/${jobId}`, { method: 'DELETE' });
      this.removeJob(jobId);
      this.showToast('Job deleted', 'success');
    } catch (err) {
      this.showToast('Failed to delete job', 'error');
    }
  }

  saveJobsToStorage() {
    const jobsArray = Array.from(this.jobs.entries());
    localStorage.setItem('stl-converter-jobs', JSON.stringify(jobsArray));
  }

  loadJobsFromStorage() {
    try {
      const stored = localStorage.getItem('stl-converter-jobs');
      if (stored) {
        const jobsArray = JSON.parse(stored);
        this.jobs = new Map(jobsArray);
        
        // Resume polling for incomplete jobs
        for (const [jobId, job] of this.jobs) {
          if (job.status === 'queued' || job.status === 'processing') {
            this.startPollingJob(jobId);
          }
        }
        
        this.renderJobs();
      }
    } catch (err) {
      console.error('Failed to load jobs from storage:', err);
    }
  }

  // Three.js Preview
  initThreeJS() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f1419);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.previewContainer.clientWidth / this.previewContainer.clientHeight,
      0.1,
      10000
    );
    this.camera.position.set(100, 100, 100);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.previewCanvas,
      antialias: true,
    });
    this.renderer.setSize(this.previewContainer.clientWidth, this.previewContainer.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(1, 1, 1);
    this.scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-1, -1, -1);
    this.scene.add(directionalLight2);

    // Grid
    const gridHelper = new THREE.GridHelper(200, 20, 0x2f3640, 0x1a1f26);
    this.scene.add(gridHelper);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  previewSTL(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const loader = new THREE.STLLoader();
      const geometry = loader.parse(e.target.result);
      
      // Remove existing mesh
      if (this.mesh) {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
      }

      // Create material
      const material = new THREE.MeshPhongMaterial({
        color: 0x1d9bf0,
        specular: 0x444444,
        shininess: 30,
        flatShading: false,
      });

      // Create mesh
      this.mesh = new THREE.Mesh(geometry, material);
      
      // Center the model
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.center();
      
      // Scale to fit view
      const size = new THREE.Vector3();
      geometry.boundingBox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 100 / maxDim;
      this.mesh.scale.set(scale, scale, scale);

      this.scene.add(this.mesh);

      // Update info
      this.vertexCount.textContent = geometry.attributes.position.count.toLocaleString();
      this.faceCount.textContent = (geometry.attributes.position.count / 3).toLocaleString();
      this.fileSize.textContent = this.formatFileSize(file.size);

      // Show preview section
      this.previewSection.classList.remove('hidden');

      // Reset camera
      this.resetCameraView();
    };

    reader.readAsArrayBuffer(file);
  }

  resetCameraView() {
    this.camera.position.set(100, 100, 100);
    this.camera.lookAt(0, 0, 0);
    this.controls.reset();
  }

  toggleWireframe() {
    if (!this.mesh) return;
    
    this.wireframeMode = !this.wireframeMode;
    this.mesh.material.wireframe = this.wireframeMode;
    
    this.toggleWireframeBtn.classList.toggle('active', this.wireframeMode);
  }

  handleResize() {
    if (!this.renderer || !this.camera) return;
    
    const width = this.previewContainer.clientWidth;
    const height = this.previewContainer.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // Health modal
  async showHealthModal() {
    this.healthModal.classList.remove('hidden');
    this.healthContent.innerHTML = `
      <div class="loading">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Checking system health...</p>
      </div>
    `;

    try {
      const response = await fetch('/health');
      const data = await response.json();

      this.healthContent.innerHTML = `
        <div class="health-status">
          <div class="health-item">
            <div class="health-item-label">
              <i class="fas fa-database"></i>
              <span>Redis</span>
            </div>
            <span class="health-badge ${data.services.redis === 'connected' ? 'healthy' : 'unhealthy'}">
              ${data.services.redis}
            </span>
          </div>
          <div class="health-item">
            <div class="health-item-label">
              <i class="fas fa-cube"></i>
              <span>FreeCAD</span>
            </div>
            <span class="health-badge ${data.services.freecad === 'available' ? 'healthy' : 'unhealthy'}">
              ${data.services.freecad}
            </span>
          </div>
          ${data.services.freecadVersion ? `
            <div class="health-item">
              <div class="health-item-label">
                <i class="fas fa-code-branch"></i>
                <span>Version</span>
              </div>
              <span style="color: var(--text-secondary); font-size: 0.85rem;">
                ${data.services.freecadVersion}
              </span>
            </div>
          ` : ''}
          <div class="health-item">
            <div class="health-item-label">
              <i class="fas fa-file-upload"></i>
              <span>Max File Size</span>
            </div>
            <span style="color: var(--text-secondary);">${data.config.maxFileSize}</span>
          </div>
          <div class="health-item">
            <div class="health-item-label">
              <i class="fas fa-clock"></i>
              <span>Job TTL</span>
            </div>
            <span style="color: var(--text-secondary);">${data.config.jobTTL}</span>
          </div>
          <div class="health-item">
            <div class="health-item-label">
              <i class="fas fa-ruler"></i>
              <span>Default Tolerance</span>
            </div>
            <span style="color: var(--text-secondary);">${data.config.defaultTolerance}</span>
          </div>
        </div>
      `;
    } catch (err) {
      this.healthContent.innerHTML = `
        <div class="health-status">
          <div class="health-item">
            <div class="health-item-label">
              <i class="fas fa-exclamation-triangle"></i>
              <span>Error</span>
            </div>
            <span class="health-badge unhealthy">Failed to check health</span>
          </div>
        </div>
      `;
    }
  }

  // Utilities
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle',
    };
    
    toast.innerHTML = `
      <i class="fas ${icons[type] || icons.info}"></i>
      <span>${this.escapeHtml(message)}</span>
    `;
    
    this.toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatTimeRemaining(seconds) {
    if (!seconds || seconds <= 0) return 'Expired';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  getStatusIcon(status) {
    const icons = {
      queued: '<i class="fas fa-hourglass-start"></i>',
      processing: '<i class="fas fa-spinner fa-spin"></i>',
      completed: '<i class="fas fa-check"></i>',
      failed: '<i class="fas fa-times"></i>',
    };
    return icons[status] || '';
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app
const app = new STLConverter();
