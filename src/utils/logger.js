const fs = require("node:fs");
const path = require("node:path");

// Compute project root (parent of src/ directory)
const PROJECT_ROOT = path.join(__dirname, "..", "..");

const LOGS_DIR = path.join(PROJECT_ROOT, "logs");

/** @type {string | null} */
let LOG_FILE = null;

/**
 * Initialize the logger. Creates the logs directory and sets up the log file.
 * Must be called before using fileLog.
 */
function initLogger() {
  if (LOG_FILE) return; // Already initialized

  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch {
    // Ignore mkdir errors
  }

  const now = new Date();
  const ts = now.toISOString().replace(/T/, "_").replace(/:/g, "-").replace(/\..+/, "");
  LOG_FILE = path.join(LOGS_DIR, `${ts}-log.txt`);
}

/**
 * Get the current log file path. Initializes logger if needed.
 * @returns {string | null}
 */
function getLogFile() {
  if (!LOG_FILE) initLogger();
  return LOG_FILE;
}

/** Strip blessed {tag} markup so log files stay readable. */
function stripTags(str) {
  return str.replace(/\{[^}]+\}/g, "");
}

/**
 * Append a line to the current session's log file.
 * @param {"INFO"|"WARN"|"ERROR"|"DEBUG"} level
 * @param {string} message
 * @param {*}      [data]  – optional structured data (will be JSON-stringified)
 */
function fileLog(level, message, data) {
  try {
    const logFile = getLogFile();
    if (!logFile) return;

    const ts = new Date().toISOString();
    let line = `[${ts}] [${level}] ${stripTags(message)}`;
    if (data !== undefined) {
      const extra =
        data instanceof Error
          ? `${data.message}\n${data.stack || ""}`
          : JSON.stringify(data, null, 2);
      line += `\n  ${extra.replace(/\n/g, "\n  ")}`;
    }
    fs.appendFileSync(logFile, `${line}\n`);
  } catch {
    // If we can't write the log file, silently continue — don't crash the app.
  }
}

module.exports = {
  initLogger,
  getLogFile,
  fileLog,
  stripTags,
  LOGS_DIR,
};
