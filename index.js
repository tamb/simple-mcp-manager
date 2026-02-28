#!/usr/bin/env node
"use strict";

const fs = require("fs");

// Initialize logger first (needed for error handling)
const { fileLog, getLogFile, initLogger } = require("./src/utils/logger");
initLogger();

const { createApp } = require("./src/ui/tui");
const { createWebApp } = require("./src/ui/web");

// ── Global Error Handlers ────────────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  fileLog("ERROR", "Uncaught exception", err);
  // Attempt to write a final message before exit
  try {
    const logFile = getLogFile();
    if (logFile) {
      fs.appendFileSync(logFile,
        `[${new Date().toISOString()}] [FATAL] Process crashing due to uncaught exception\n`);
    }
  } catch {}
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  fileLog("ERROR", "Unhandled promise rejection", reason instanceof Error ? reason : { reason });
});

// ── Entry Point ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const useWebUI = args.includes("--ui");

// Parse --port flag (only valid with --ui)
let port = 3000;
const portIndex = args.indexOf("--port");
if (portIndex !== -1 && args[portIndex + 1]) {
  const parsedPort = parseInt(args[portIndex + 1], 10);
  if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
    port = parsedPort;
  } else {
    console.error("Error: Invalid port number. Port must be between 1 and 65535.");
    process.exit(1);
  }
}

if (useWebUI) {
  createWebApp(port).catch((err) => {
    fileLog("ERROR", "Failed to start Web UI", err);
    console.error("Failed to start Web UI:", err.message);
    process.exit(1);
  });
} else {
  createApp();
}
