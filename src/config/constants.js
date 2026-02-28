"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { fileLog } = require("../utils/logger");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

// Detect WSL — the tool runs on Linux but the AI agents (Cursor, VS Code, etc.)
// are Windows apps that spawn Windows processes, so we need Windows-side detection.
const IS_WSL = (() => {
  if (IS_WIN || IS_MAC) return false;
  try {
    const release = os.release().toLowerCase();
    if (release.includes("microsoft") || release.includes("wsl")) {
      fileLog("INFO", "WSL detected via os.release()", { release });
      return true;
    }
    if (fs.existsSync("/proc/sys/fs/binfmt_misc/WSLInterop")) {
      fileLog("INFO", "WSL detected via /proc/sys/fs/binfmt_misc/WSLInterop");
      return true;
    }
    const version = fs.readFileSync("/proc/version", "utf-8").toLowerCase();
    if (version.includes("microsoft") || version.includes("wsl")) {
      fileLog("INFO", "WSL detected via /proc/version");
      return true;
    }
    return false;
  } catch (e) {
    fileLog("WARN", "WSL detection failed", e);
    return false;
  }
})();

const HOME = os.homedir();

// On WSL the AI agents live on both sides: Cursor uses the WSL homedir
// (~/.cursor/mcp.json) while GitHub Copilot uses the Windows user profile
// (~/.mcp.json on the Win side). We need to scan both.
const WIN_HOME = IS_WSL ? (() => {
  try {
    const winPath = execSync('cmd.exe /C "echo %USERPROFILE%"', {
      encoding: "utf-8", timeout: 5000,
    }).trim().replace(/\r/g, "");
    const resolved = execSync(`wslpath -u "${winPath}"`, {
      encoding: "utf-8", timeout: 3000,
    }).trim();
    fileLog("INFO", `WIN_HOME resolved: ${resolved} (from ${winPath})`);
    return resolved;
  } catch (e) {
    fileLog("ERROR", "Failed to resolve WIN_HOME", e);
    return null;
  }
})() : null;

const APPDATA = process.env.APPDATA || (() => {
  if (!IS_WSL) return "";
  try {
    const winPath = execSync('cmd.exe /C "echo %APPDATA%"', {
      encoding: "utf-8", timeout: 5000,
    }).trim().replace(/\r/g, "");
    const resolved = execSync(`wslpath -u "${winPath}"`, {
      encoding: "utf-8", timeout: 3000,
    }).trim();
    fileLog("INFO", `APPDATA resolved: ${resolved} (from ${winPath})`);
    return resolved;
  } catch (e) {
    fileLog("ERROR", "Failed to resolve APPDATA", e);
    return "";
  }
})();

const XDG_CONFIG = process.env.XDG_CONFIG_HOME || path.join(HOME, ".config");

module.exports = {
  IS_WIN,
  IS_MAC,
  IS_WSL,
  HOME,
  WIN_HOME,
  APPDATA,
  XDG_CONFIG,
};
