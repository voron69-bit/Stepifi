const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const logger = require('../utils/logger');

const FREECAD = '/opt/conda/bin/freecadcmd';   // HEADLESS FreeCAD

class ConverterService {
  constructor() {
    this.pythonScript = path.join(config.paths.pythonScripts, 'convert.py');
  }

  /**
   * Convert STL to STEP using FreeCAD
   */
  async convert(inputPath, outputPath, options = {}) {
    const tolerance = options.tolerance || config.conversion.defaultTolerance;
    const repair = options.repair !== false && config.conversion.repairMesh;

    if (tolerance < config.conversion.minTolerance || tolerance > config.conversion.maxTolerance) {
      return { success: false, error: `Tolerance must be between ${config.conversion.minTolerance} and ${config.conversion.maxTolerance}` };
    }

    try {
      await fs.access(inputPath);
    } catch {
      return { success: false, error: 'Input file not found' };
    }

    return new Promise((resolve) => {
      const args = [
        this.pythonScript,
        inputPath,
        outputPath,
        `--tolerance=${tolerance}`,
        repair ? '--repair' : '--no-repair'
      ];

      const proc = spawn(FREECAD, args, {
        timeout: config.conversion.timeout,
        env: {
          ...process.env,
          QT_QPA_PLATFORM: 'offscreen',
          XDG_RUNTIME_DIR: '/tmp/runtime'
        }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());

      proc.on('close', code => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim().split('\n').pop());
            resolve(result);
          } catch {
            logger.error('Failed to parse conversion output', { stdout, stderr });
            resolve({ success: false, error: 'Failed to parse conversion result', stdout, stderr });
          }
        } else {
          resolve({ success: false, error: stderr || 'Conversion failed', code, stderr });
        }
      });

      proc.on('error', err => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * Get mesh info
   */
  async getMeshInfo(inputPath) {
    return new Promise(resolve => {
      const args = [this.pythonScript, inputPath, '/dev/null', '--info'];

      const proc = spawn(FREECAD, args, {
        timeout: 30000,
        env: {
          ...process.env,
          QT_QPA_PLATFORM: 'offscreen',
          XDG_RUNTIME_DIR: '/tmp/runtime'
        }
      });

      let stdout = '';

      proc.stdout.on('data', d => stdout += d.toString());

      proc.on('close', code => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout.trim().split('\n').pop()));
          } catch {
            resolve({ success: false, error: 'Failed to parse mesh info' });
          }
        } else {
          resolve({ success: false, error: 'Failed to get mesh info' });
        }
      });

      proc.on('error', err => resolve({ success: false, error: err.message }));
    });
  }

  /**
   * Check FreeCAD availability
   */
  async checkFreecad() {
    return new Promise(resolve => {
      const proc = spawn(FREECAD, ['--version'], {
        timeout: 10000,
        env: {
          ...process.env,
          QT_QPA_PLATFORM: 'offscreen',
          XDG_RUNTIME_DIR: '/tmp/runtime'
        }
      });

      let stdout = '';

      proc.stdout.on('data', d => stdout += d.toString());

      proc.on('close', code => {
        resolve({
          available: code === 0,
          version: stdout.trim() || null
        });
      });

      proc.on('error', () => resolve({ available: false }));
    });
  }
}

module.exports = new ConverterService();
