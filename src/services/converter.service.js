const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const logger = require('../utils/logger');

const FREECAD = '/opt/conda/bin/freecadcmd';   // Correct headless FreeCAD binary

// Fixed environment block shared by all spawns
const FREECAD_ENV = {
  ...process.env,
  QT_QPA_PLATFORM: 'offscreen',
  XDG_RUNTIME_DIR: '/tmp/runtime',
  CONDA_PREFIX: '/opt/conda',
  LD_LIBRARY_PATH: '/opt/conda/lib'
};

class ConverterService {
  constructor() {
    this.pythonScript = path.join(config.paths.pythonScripts, 'convert.py');
  }

  /**
   * Convert STL → STEP
   */
  async convert(inputPath, outputPath, options = {}) {
    const tolerance = options.tolerance || config.conversion.defaultTolerance;
    const repair = options.repair !== false && config.conversion.repairMesh;

    // Validate tolerance
    if (tolerance < config.conversion.minTolerance ||
        tolerance > config.conversion.maxTolerance) {
      return {
        success: false,
        error: `Tolerance must be between ${config.conversion.minTolerance} and ${config.conversion.maxTolerance}`,
      };
    }

    // Ensure file exists
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

      logger.debug('Running FreeCAD conversion', { cmd: FREECAD, args });

      const proc = spawn(FREECAD, args, {
        timeout: config.conversion.timeout,
        env: FREECAD_ENV
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => stdout += d.toString());
      proc.stderr.on('data', (d) => stderr += d.toString());

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim().split('\n').pop());
            resolve(result);
          } catch (err) {
            logger.error('Failed to parse conversion output', { stdout, stderr });
            resolve({
              success: false,
              error: 'Failed to parse conversion result',
              stdout,
              stderr,
            });
          }
        } else {
          logger.error('Conversion failed', { code, stderr });

          resolve({
            success: false,
            error: stderr.trim() || 'Conversion failed',
            code,
            stderr,
          });
        }
      });

      proc.on('error', (err) => {
        logger.error('Failed to spawn FreeCAD', { error: err.message });
        resolve({
          success: false,
          error: err.code === 'ENOENT'
            ? 'FreeCAD (freecadcmd) not found'
            : err.message
        });
      });
    });
  }

  /**
   * Get mesh info
   */
  async getMeshInfo(inputPath) {
    return new Promise((resolve) => {
      const args = [
        this.pythonScript,
        inputPath,
        '/dev/null',
        '--info'
      ];

      const proc = spawn(FREECAD, args, {
        timeout: 30000,
        env: FREECAD_ENV
      });

      let stdout = '';
      proc.stdout.on('data', (d) => stdout += d.toString());

      proc.on('close', (code) => {
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

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * Check FreeCAD availability
   */
  async checkFreecad() {
    return new Promise((resolve) => {
      const proc = spawn(FREECAD, ['--version'], {
        timeout: 10000,
        env: FREECAD_ENV
      });

      let stdout = '';
      proc.stdout.on('data', (d) => stdout += d.toString());

      proc.on('close', (code) => {
        resolve({
          available: code === 0,
          version: stdout.trim() || null,
        });
      });

      proc.on('error', () => {
        resolve({ available: false });
      });
    });
  }
}

module.exports = new ConverterService();
