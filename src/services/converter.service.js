const { spawn } = require("child_process");
const path = require("path");
const logger = require("../utils/logger");
const config = require("../config");

class ConverterService {
  constructor() {
    this.freecadCmd = "/opt/conda/bin/freecadcmd";
    this.pythonScript = path.join(__dirname, "../scripts/convert.py");
  }

  async convert(inputPath, outputPath, options = {}) {
    const tolerance = options.tolerance || config.conversion.defaultTolerance;
    const repair = options.repair !== false;

    logger.info("Running FreeCAD conversion", {
      cmd: this.freecadCmd,
      args: [
        "--console",
        "--python", this.pythonScript,
        "--",
        inputPath,
        outputPath,
        `--tolerance=${tolerance}`,
        repair ? "--repair" : "--no-repair",
      ]
    });

    return new Promise((resolve, reject) => {
      const args = [
        "--console",
        "--python", this.pythonScript,
        "--",
        inputPath,
        outputPath,
        `--tolerance=${tolerance}`,
        repair ? "--repair" : "--no-repair",
      ];

      const proc = spawn(this.freecadCmd, args, { stdio: ["ignore", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => (stdout += d.toString()));
      proc.stderr.on("data", (d) => (stderr += d.toString()));

      proc.on("close", (code) => {
        if (code !== 0) {
          logger.error("Conversion failed", { code, stderr });
          return reject(new Error(stderr || `FreeCAD exited with code ${code}`));
        }

        // Validate STEP file truly exists and is > 0 bytes
        try {
          const size = require("fs").statSync(outputPath).size;
          if (size === 0) {
            return reject(new Error("Generated STEP file is empty"));
          }
        } catch (err) {
          return reject(new Error("STEP file not generated"));
        }

        logger.info("Conversion completed successfully");
        resolve({ stdout, stderr });
      });
    });
  }
}

module.exports = new ConverterService();
