const fs = require("node:fs");
const path = require("node:path");
const { TOOLS } = require("../config/tools");
const { fileLog } = require("../utils/logger");

// ── Discovery Options ───────────────────────────────────────────────────────

/** @type {{ cwd: string, scanDirs: string[] }} */
const discoveryOptions = {
  cwd: process.cwd(),
  scanDirs: [],
};

/**
 * Configure discovery roots for workspace-relative config scanning.
 * @param {{ cwd?: string, scanDirs?: string[] }} opts
 */
function setDiscoveryOptions(opts = {}) {
  if (opts.cwd) {
    discoveryOptions.cwd = path.resolve(opts.cwd);
  }
  if (opts.scanDirs) {
    discoveryOptions.scanDirs = opts.scanDirs.map((d) => path.resolve(d));
  }
}

function getDiscoveryOptions() {
  return { ...discoveryOptions };
}

/**
 * Stable identifier for a server entry.
 * @param {string} configPath
 * @param {string} name
 * @returns {string}
 */
function makeServerId(configPath, name) {
  return `${path.resolve(configPath)}::${name}`;
}

function getWorkspaceRoots() {
  const roots = [discoveryOptions.cwd, ...discoveryOptions.scanDirs];
  return [...new Set(roots.map((r) => path.resolve(r)))];
}

// ── Config Discovery ────────────────────────────────────────────────────────

function findMcpConfigs() {
  const configs = [];
  const seen = new Set();

  function addConfig(filePath, tool, source) {
    const resolved = path.resolve(filePath);
    if (seen.has(resolved)) return;
    if (!fs.existsSync(filePath)) return;
    seen.add(resolved);
    configs.push({ path: filePath, tool: tool.name, configKey: tool.configKey, source });
    fileLog("DEBUG", `Config found: [${tool.name}] ${source} → ${resolved}`);
  }

  for (const tool of TOOLS) {
    // Global configs
    for (const p of tool.paths.global) {
      addConfig(p, tool, "global");
    }

    // Project-level configs (directories containing per-project configs)
    for (const projDir of tool.paths.projects) {
      if (fs.existsSync(projDir)) {
        try {
          for (const entry of fs.readdirSync(projDir)) {
            const projCfg = path.join(projDir, entry, tool.projectGlob || "mcp.json");
            addConfig(projCfg, tool, "project");
          }
        } catch (e) {
          fileLog("ERROR", `Error reading project dir: ${projDir}`, e);
        }
      }
    }

    // Workspace-level configs (relative to cwd and extra scan dirs)
    for (const root of getWorkspaceRoots()) {
      for (const rel of tool.paths.workspace) {
        const fullPath = path.join(root, rel);
        addConfig(fullPath, tool, root === discoveryOptions.cwd ? "workspace" : "scan-dir");
      }
    }
  }

  fileLog("INFO", `Config discovery complete: ${configs.length} config file(s) found`);
  return configs;
}

function parseMcpConfig(configPath, configKey, tool, source) {
  const servers = [];
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const data = JSON.parse(raw);

    // Try the tool's preferred key first, then fall back to the other common key
    const mcpServers =
      data[configKey] || data[configKey === "mcpServers" ? "servers" : "mcpServers"] || {};

    for (const [name, cfg] of Object.entries(mcpServers)) {
      if (!cfg || typeof cfg !== "object") continue;
      servers.push({
        id: makeServerId(configPath, name),
        name,
        command: cfg.command || "",
        args: cfg.args || [],
        env: cfg.env || {},
        type: cfg.type || "stdio",
        url: cfg.url || "",
        tool,
        source,
        configPath,
        pid: null,
        clusterPids: [],
        status: "unknown",
        processInfo: "",
        sharedWith: [],
        sharedPid: null,
        logs: [],
        logsCapturing: false,
        httpHealth: null,
        httpLatencyMs: null,
        searchTerms: [],
      });
    }
    fileLog(
      "DEBUG",
      `Parsed ${servers.length} server(s) from ${configPath} [${tool}]`,
      servers.map((s) => s.name),
    );
  } catch (e) {
    fileLog("ERROR", `Failed to parse config: ${configPath}`, e);
  }
  return servers;
}

function loadAllServers() {
  const configs = findMcpConfigs();
  const allServers = [];
  for (const cfg of configs) {
    allServers.push(...parseMcpConfig(cfg.path, cfg.configKey, cfg.tool, cfg.source));
  }

  // Deduplicate by id so the same server definition from the same file
  // only appears once.
  const seen = new Map();
  for (const s of allServers) {
    if (!seen.has(s.id)) {
      seen.set(s.id, s);
    }
  }
  return Array.from(seen.values());
}

module.exports = {
  setDiscoveryOptions,
  getDiscoveryOptions,
  makeServerId,
  findMcpConfigs,
  parseMcpConfig,
  loadAllServers,
};
