#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

// Initialize logger first (needed for error handling)
const { fileLog, getLogFile, initLogger } = require("./src/utils/logger");
initLogger();

const { setDiscoveryOptions } = require("./src/core/discovery");
const { validateAllConfigs } = require("./src/core/validate");
const { createApp } = require("./src/ui/tui");
const { createWebApp } = require("./src/ui/web/server");

// ── Global Error Handlers ────────────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  fileLog("ERROR", "Uncaught exception", err);
  try {
    const logFile = getLogFile();
    if (logFile) {
      fs.appendFileSync(
        logFile,
        `[${new Date().toISOString()}] [FATAL] Process crashing due to uncaught exception\n`,
      );
    }
  } catch {}
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  fileLog("ERROR", "Unhandled promise rejection", reason instanceof Error ? reason : { reason });
});

// ── CLI Argument Parsing ─────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = {
    useWebUI: false,
    port: 3000,
    validate: false,
    cwd: process.cwd(),
    scanDirs: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--ui") {
      options.useWebUI = true;
    } else if (arg === "--validate") {
      options.validate = true;
    } else if (arg === "--port") {
      const parsedPort = parseInt(argv[i + 1], 10);
      if (!Number.isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
        options.port = parsedPort;
        i++;
      } else {
        console.error("Error: Invalid port number. Port must be between 1 and 65535.");
        process.exit(1);
      }
    } else if (arg === "--cwd") {
      const next = argv[i + 1];
      if (!next) {
        console.error("Error: --cwd requires a path argument.");
        process.exit(1);
      }
      options.cwd = path.resolve(next);
      i++;
    } else if (arg === "--scan-dir") {
      const next = argv[i + 1];
      if (!next) {
        console.error("Error: --scan-dir requires a path argument.");
        process.exit(1);
      }
      options.scanDirs.push(path.resolve(next));
      i++;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Error: Unknown argument "${arg}". Use --help for usage.`);
      process.exit(1);
    }
  }

  return options;
}

function printHelp() {
  console.log(`MCP Server Manager — monitor and restart local MCP servers

Usage:
  mcp-manager [options]
  mcp-mgr [options]
  simple-mcp-manager [options]

Options:
  --ui              Start Web UI mode (default: terminal UI)
  --port <n>        Web UI port (default: 3000, use with --ui)
  --cwd <path>      Working directory for workspace config discovery
  --scan-dir <path> Extra directory to scan for workspace configs (repeatable)
  --validate        Validate MCP config files and exit
  -h, --help        Show this help

Bin names: mcp-manager, mcp-mgr, simple-mcp-manager
`);
}

function runValidate() {
  const { valid, issues } = validateAllConfigs();

  if (issues.length === 0) {
    console.log("All MCP config files are valid.");
    process.exit(0);
  }

  for (const issue of issues) {
    const prefix = issue.severity === "error" ? "ERROR" : "WARN";
    const loc = issue.configPath ? ` (${issue.configPath})` : "";
    console.log(`${prefix}${loc}: ${issue.message}`);
  }

  process.exit(valid ? 0 : 1);
}

// ── Entry Point ─────────────────────────────────────────────────────────────

const options = parseArgs(process.argv.slice(2));

setDiscoveryOptions({
  cwd: options.cwd,
  scanDirs: options.scanDirs,
});

if (options.validate) {
  runValidate();
} else if (options.useWebUI) {
  createWebApp(options.port).catch((err) => {
    fileLog("ERROR", "Failed to start Web UI", err);
    console.error("Failed to start Web UI:", err.message);
    process.exit(1);
  });
} else {
  createApp();
}
