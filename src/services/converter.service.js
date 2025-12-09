const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const logger = require('../utils/logger');

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
    
    // Validate tolerance
    if (tolerance < config.conversion.minTolerance || tolerance > config.conversion.maxTolerance) {
      return {
        success: false,
        error: `Tolerance must be between ${config.conversion.minTolerance} and ${config.conversion.maxTolerance}`,
      };
    }
    
    // Ensure input file exists
    try {
      await fs.access(inputPath);
    } catch {
      return {
        success: false,
        error: 'Input file not found',
      };
    }
    
    return new Promise((resolve) => {
      const args = [
        this.pythonScript,
        inputPath,
        outputPath,
        `--tolerance=${tolerance}`,
      ];
      
      if (repair) {
        args.push('--repair');
      } else {
        args.push('--no-repair');
      }
      
      logger.debug('Running FreeCAD conversion', { args });
      
      // Use freecad for headless operation
      const process = spawn('/opt/conda/bin/freecad', args, {
        timeout: config.conversion.timeout,
        env: {
          ...process.env,
          DISPLAY: '', // Ensure headless mode
        },
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', async (code) => {
        if (code === 0) {
          try {
            // Parse JSON output from Python script
            const result = JSON.parse(stdout.trim().split('\n').pop());
            resolve(result);
          } catch (parseErr) {
            logger.error('Failed to parse conversion output', { stdout, stderr });
            resolve({
              success: false,
              error: 'Failed to parse conversion result',
              stdout,
              stderr,
            });
          }
        } else {
          logger.error('Conversion process failed', { code, stderr });
          
          // Try to extract error from stderr
          let errorMessage = 'Conversion failed';
          if (stderr.includes('No module named')) {
            errorMessage = 'FreeCAD modules not available';
          } else if (stderr.includes('timeout')) {
            errorMessage = 'Conversion timed out';
          } else if (stderr) {
            errorMessage = stderr.split('\n').filter(Boolean).pop() || errorMessage;
          }
          
          resolve({
            success: false,
            error: errorMessage,
            code,
            stderr,
          });
        }
      });
      
      process.on('error', (err) => {
        logger.error('Failed to spawn conversion process', { error: err.message });
        
        let errorMessage = err.message;
        if (err.code === 'ENOENT') {
          errorMessage = 'FreeCAD (freecad) not found. Please install FreeCAD.';
        }
        
        resolve({
          success: false,
          error: errorMessage,
        });
      });
    });
  }

  /**
   * Get mesh info without converting
   */
  async getMeshInfo(inputPath) {
    return new Promise((resolve) => {
      const args = [
        this.pythonScript,
        inputPath,
        '/dev/null', // Won't be used with --info
        '--info',
      ];
      
      const process = spawn('/opt/conda/bin/freecad', args, {
        timeout: 30000, // 30 second timeout for info
        env: {
          ...process.env,
          DISPLAY: '',
        },
      });
      
      let stdout = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim().split('\n').pop());
            resolve(result);
          } catch {
            resolve({ success: false, error: 'Failed to parse mesh info' });
          }
        } else {
          resolve({ success: false, error: 'Failed to get mesh info' });
        }
      });
      
      process.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * Validate that FreeCAD is available
   */
  async checkFreecad() {
    return new Promise((resolve) => {
      const process = spawn('/opt/conda/bin/freecad', ['--version'], {
        timeout: 10000,
      });
      
      let stdout = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.on('close', (code) => {
        resolve({
          available: code === 0,
          version: stdout.trim(),
        });
      });
      
      process.on('error', () => {
        resolve({ available: false });
      });
    });
  }
}

module.exports = new ConverterService();
