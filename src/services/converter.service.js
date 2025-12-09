const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs").promises;
const config = require("../config");
const logger = require("../utils/logger");

const FREECAD = "/opt/conda/bin/freecadcmd";

const FREECAD_ENV = {
  ...process.env,
  QT_QPA_PLATFORM: "offscreen",
  XDG_RUNTIME_DIR: "/tmp/runtime",
  CONDA_PREFIX: "/opt/conda",
  LD_LIBRARY_PATH: "/opt/conda/lib"
};

class ConverterService {
  constructor() {
    this.pythonScript = path.join(config.paths.pythonScripts, "convert.py");
  }

  /**
   * Convert STL → STEP
   */
  async convert(inputPath, outputPath, options = {}) {
    const tolerance =
      options.tolerance || config.conversion.defaultTolerance;

    const repair =
      options.repair !== false && config.conversion.repairMesh;

    // Ensure file exists
    try {
      await fs.access(inputPath);
    } catch {
      return { success: false, error: "Input file not found" };
    }

    return new Promise((resolve) => {

      const args = [
        "-c",
        this.pythonScript,
        "--",               // <<< REQUIRED — separates FreeCAD args from python args
        inputPath,
        outputPath,
        "--tolerance",
        String(tolerance),
        repair ? "--repair" : "--no-repair"
      ];

      logger.debug("FreeCAD conversion", { cmd: FREECAD, args });

      const proc = spawn(FREECAD, args, {
        env: FREECAD_ENV,
        timeout: config.conversion.timeout
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => (stdout += d.toString()));
      proc.stderr.on("data", (d) => (stderr += d.toString()));

      proc.on("close", (code) => {
        if (code === 0) {
          try {
            const json = JSON.parse(stdout.trim().split("\n").pop());
            resolve(json);
          } catch (e) {
            resolve({
              success: false,
              error: "Failed to parse conversion JSON",
              stdout,
              stderr
            });
          }
        } else {
          resolve({
            success: false,
            error: stderr.trim() || "FreeCAD conversion failed",
            code,
            stderr
          });
        }
      });

      proc.on("error", (err) => {
        resolve({
          success: false,
          error:
            err.code === "ENOENT"
              ? "FreeCAD binary not found"
              : err.message
        });
      });
    });
  }

  /**
   * Mesh info
   */
  async getMeshInfo(inputPath) {
    return new Promise((resolve) => {
      const args = [
        "-c",
        this.pythonScript,
        "--",
        inputPath,
        "/dev/null",
        "--info"
      ];

      const proc = spawn(FREECAD, args, { env: FREECAD_ENV, timeout: 20000 });

      let stdout = "";
      proc.stdout.on("data", (d) => (stdout += d.toString()));

      proc.on("close", (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout.trim().split("\n").pop()));
          } catch {
            resolve({ success: false, error: "Failed to parse mesh info JSON" });
          }
        } else {
          resolve({ success: false, error: "FreeCAD mesh-info failed" });
        }
      });
    });
  }

  /**
   * FreeCAD availability
   */
  async checkFreecad() {
    return new Promise((resolve) => {
      const proc = spawn(FREECAD, ["--version"], {
        env: FREECAD_ENV,
        timeout: 5000
      });

      let stdout = "";
      proc.stdout.on("data", (d) => (stdout += d.toString()));

      proc.on("close", () => {
        resolve({
          available: true,
          version: stdout.trim()
        });
      });

      proc.on("error", () => resolve({ available: false }));
    });
  }
}

module.exports = new ConverterService();
