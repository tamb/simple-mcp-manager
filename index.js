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
const useWebUI = args.includes("-ui") || args.includes("--ui");

if (useWebUI) {
  createWebApp().catch((err) => {
    fileLog("ERROR", "Failed to start Web UI", err);
    console.error("Failed to start Web UI:", err.message);
    process.exit(1);
  });
} else {
  createApp();
}
