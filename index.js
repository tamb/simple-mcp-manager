#!/usr/bin/env node
"use strict";

const blessed = require("blessed");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, spawn } = require("child_process");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

// ── File Logger ──────────────────────────────────────────────────────────────
// Writes structured logs to  logs/<datetime>-log.txt  in the project root.

const LOGS_DIR = path.join(__dirname, "logs");
const LOG_FILE = (() => {
  try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch {}
  const now = new Date();
  const ts = now.toISOString().replace(/T/, "_").replace(/:/g, "-").replace(/\..+/, "");
  return path.join(LOGS_DIR, `${ts}-log.txt`);
})();

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
    const ts = new Date().toISOString();
    let line = `[${ts}] [${level}] ${stripTags(message)}`;
    if (data !== undefined) {
      const extra = data instanceof Error
        ? `${data.message}\n${data.stack || ""}`
        : JSON.stringify(data, null, 2);
      line += `\n  ${extra.replace(/\n/g, "\n  ")}`;
    }
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // If we can't write the log file, silently continue — don't crash the app.
  }
}

fileLog("INFO", `Session started — log file: ${LOG_FILE}`);

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

// ── Tool Definitions ────────────────────────────────────────────────────────
// Each tool defines where its MCP config lives on each platform.
// configKey is the JSON key that holds the server map (usually "mcpServers").

const TOOLS = [
  {
    name: "Cursor",
    configKey: "mcpServers",
    paths: {
      global: [
        // Cursor in WSL uses the Linux home; on native Windows uses APPDATA
        path.join(HOME, ".cursor", "mcp.json"),
        ...(IS_WIN ? [path.join(APPDATA, "Cursor", "User", "mcp.json")] : []),
        ...(IS_WSL && APPDATA ? [path.join(APPDATA, "Cursor", "User", "mcp.json")] : []),
      ],
      projects: [path.join(HOME, ".cursor", "projects")],
      workspace: [".cursor/mcp.json"],
    },
    projectGlob: "mcp.json",
  },
  {
    name: "VS Code",
    configKey: "servers",
    paths: {
      global: [
        path.join(HOME, ".vscode", "mcp.json"),
        ...(IS_WIN
          ? [path.join(APPDATA, "Code", "User", "mcp.json")]
          : IS_MAC
            ? [path.join(HOME, "Library", "Application Support", "Code", "User", "mcp.json")]
            : [path.join(XDG_CONFIG, "Code", "User", "mcp.json")]),
        ...(IS_WSL && APPDATA ? [path.join(APPDATA, "Code", "User", "mcp.json")] : []),
      ],
      projects: [],
      workspace: [".vscode/mcp.json"],
    },
    projectGlob: null,
  },
  {
    name: "Windsurf",
    configKey: "mcpServers",
    paths: {
      global: [
        path.join(HOME, ".codeium", "windsurf", "mcp_config.json"),
        ...(IS_WIN
          ? [path.join(APPDATA, "Windsurf", "User", "mcp_config.json")]
          : IS_MAC
            ? [path.join(HOME, "Library", "Application Support", "Windsurf", "User", "mcp_config.json")]
            : [path.join(XDG_CONFIG, "Windsurf", "User", "mcp_config.json")]),
        ...(IS_WSL && APPDATA ? [path.join(APPDATA, "Windsurf", "User", "mcp_config.json")] : []),
      ],
      projects: [],
      workspace: [".windsurf/mcp.json"],
    },
    projectGlob: null,
  },
  {
    name: "Claude Desktop",
    configKey: "mcpServers",
    paths: {
      global: [
        ...(IS_WIN
          ? [path.join(APPDATA, "Claude", "claude_desktop_config.json")]
          : IS_MAC
            ? [path.join(HOME, "Library", "Application Support", "Claude", "claude_desktop_config.json")]
            : [path.join(XDG_CONFIG, "claude", "claude_desktop_config.json")]),
        ...(IS_WSL && APPDATA ? [path.join(APPDATA, "Claude", "claude_desktop_config.json")] : []),
      ],
      projects: [],
      workspace: [],
    },
    projectGlob: null,
  },
  {
    name: "GitHub Copilot",
    configKey: "servers",
    paths: {
      global: [
        // GitHub Copilot is a Windows app — uses the Windows user profile
        ...(WIN_HOME && WIN_HOME !== HOME ? [path.join(WIN_HOME, ".mcp.json")] : []),
        path.join(HOME, ".mcp.json"),
      ],
      projects: [],
      workspace: [".mcp.json"],
    },
    projectGlob: null,
  },
  {
    name: "Claude Code",
    configKey: "mcpServers",
    paths: {
      global: [
        path.join(HOME, ".claude", "mcp.json"),
        path.join(HOME, ".claude.json"),
      ],
      projects: [],
      workspace: [".claude/mcp.json"],
    },
    projectGlob: null,
  },
];

// ── Path Helpers ─────────────────────────────────────────────────────────────

/**
 * Abbreviate a config file path for display:
 *   - Replace HOME with ~
 *   - Replace APPDATA with %APPDATA% (Windows)
 *   - Trim to maxLen with leading ellipsis if needed
 */
function abbreviatePath(filePath, maxLen) {
  let p = path.resolve(filePath);

  // Normalise to forward slashes for display
  p = p.replace(/\\/g, "/");
  const home = HOME.replace(/\\/g, "/");

  // Replace known prefixes
  if (IS_WIN && APPDATA) {
    const appdata = APPDATA.replace(/\\/g, "/");
    if (p.startsWith(appdata)) {
      p = "%APPDATA%" + p.slice(appdata.length);
    }
  }
  if (p.startsWith(home)) {
    p = "~" + p.slice(home.length);
  }

  if (maxLen && p.length > maxLen) {
    p = "..." + p.slice(p.length - maxLen + 3);
  }
  return p;
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
            addConfig(projCfg, tool, `project`);
          }
        } catch (e) {
          fileLog("ERROR", `Error reading project dir: ${projDir}`, e);
        }
      }
    }

    // Workspace-level configs (relative to cwd)
    for (const rel of tool.paths.workspace) {
      const fullPath = path.join(process.cwd(), rel);
      addConfig(fullPath, tool, "workspace");
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
      data[configKey] ||
      data[configKey === "mcpServers" ? "servers" : "mcpServers"] ||
      {};

    for (const [name, cfg] of Object.entries(mcpServers)) {
      if (!cfg || typeof cfg !== "object") continue;
      servers.push({
        name,
        command: cfg.command || "",
        args: cfg.args || [],
        env: cfg.env || {},
        type: cfg.type || "stdio",
        tool,
        source,
        configPath,
        pid: null,
        clusterPids: [],
        status: "unknown",
        processInfo: "",
        sharedWith: [],
        sharedPid: null,
      });
    }
    fileLog("DEBUG", `Parsed ${servers.length} server(s) from ${configPath} [${tool}]`,
      servers.map((s) => s.name));
  } catch (e) {
    fileLog("ERROR", `Failed to parse config: ${configPath}`, e);
  }
  return servers;
}

function loadAllServers() {
  const configs = findMcpConfigs();
  const allServers = [];
  for (const cfg of configs) {
    allServers.push(
      ...parseMcpConfig(cfg.path, cfg.configKey, cfg.tool, cfg.source)
    );
  }

  // Deduplicate by configPath+serverName so the same server definition
  // from the same file only appears once (first tool to claim the file wins,
  // controlled by TOOLS array order and findMcpConfigs' seen set).
  const seen = new Map();
  for (const s of allServers) {
    const resolved = path.resolve(s.configPath);
    const key = `${resolved}::${s.name}`;
    if (!seen.has(key)) {
      seen.set(key, s);
    }
  }
  return Array.from(seen.values());
}

// ── Process Detection (Cross-Platform) ──────────────────────────────────────

function getRunningProcesses() {
  try {
    let procs;
    if (IS_WIN) {
      procs = getRunningProcessesWindows();
    } else if (IS_WSL) {
      procs = getRunningProcessesWSL();
    } else {
      procs = getRunningProcessesUnix();
    }
    fileLog("DEBUG", `Process query returned ${procs.length} process(es)`);
    return procs;
  } catch (e) {
    fileLog("ERROR", "getRunningProcesses() failed", e);
    return [];
  }
}

function getRunningProcessesUnix() {
  const output = execSync("ps aux --no-headers", {
    encoding: "utf-8",
    timeout: 5000,
  });
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: parseInt(parts[1], 10),
        cpu: parts[2],
        mem: parts[3],
        command: parts.slice(10).join(" "),
      };
    });
}

function getRunningProcessesWSL() {
  // On WSL the AI agents are Windows apps — query Windows processes via interop.
  // Include ParentProcessId so we can group process trees.
  try {
    const start = Date.now();
    const output = execSync(
      'powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"',
      { encoding: "utf-8", timeout: 15000 }
    );
    const elapsed = Date.now() - start;

    const lines = output.split("\n").filter(Boolean);
    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim().replace(/\r/g, "");
      if (!line) continue;
      const match = line.match(/"(\d+)","(\d+)","(.*)"/);
      if (match) {
        results.push({
          pid: parseInt(match[1], 10),
          ppid: parseInt(match[2], 10),
          cpu: "-",
          mem: "-",
          command: match[3],
        });
      }
    }
    fileLog("DEBUG", `WSL process query: ${results.length} procs in ${elapsed}ms`);
    return results;
  } catch (e) {
    fileLog("ERROR", "getRunningProcessesWSL() failed", e);
    return [];
  }
}

function getRunningProcessesWindows() {
  // Use PowerShell; WMIC is deprecated/removed on Windows 11 and recent Windows 10.
  return getRunningProcessesPowerShell();
}

function getRunningProcessesPowerShell() {
  try {
    const output = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"',
      { encoding: "utf-8", timeout: 15000 }
    );

    const lines = output.split("\n").filter(Boolean);
    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const match = line.match(/"(\d+)","(.*)"/);
      if (match) {
        results.push({
          pid: parseInt(match[1], 10),
          cpu: "-",
          mem: "-",
          command: match[2],
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

function getSearchTerms(server) {
  const searchTerms = [];

  const isNpx =
    server.command === "npx" ||
    server.command === "npx.cmd" ||
    server.command.endsWith("\\npx.cmd") ||
    server.command.endsWith("/npx");

  if (isNpx) {
    for (const arg of server.args) {
      if (arg.startsWith("@") || (!arg.startsWith("-") && arg.includes("/"))) {
        searchTerms.push(arg);
      }
    }
  }

  if (server.command && !isNpx) {
    // For generic commands (node, python, etc.), combine the command
    // with the first non-flag argument to avoid matching every process
    // using the same interpreter.  e.g. "node /path/to/server.js" should
    // match on "/path/to/server.js", not on "node".
    const firstArg = server.args.find((a) => !a.startsWith("-"));
    if (firstArg) {
      searchTerms.push(firstArg);
      // Also try the Windows-ified path variant
      if (IS_WIN || IS_WSL) {
        searchTerms.push(firstArg.replace(/\//g, "\\"));
      }
    }

    // Still add the command itself as a fallback, but only if it's a
    // specific path (not a bare interpreter name like "node" or "python").
    const basename = path.basename(server.command).replace(/\.exe$/i, "").toLowerCase();
    const genericInterpreters = new Set([
      "node", "python", "python3", "ruby", "java", "deno", "bun",
      "sh", "bash", "zsh", "cmd", "powershell", "pwsh",
    ]);
    if (!genericInterpreters.has(basename)) {
      searchTerms.push(path.basename(server.command));
      if (server.command.includes("/") || server.command.includes("\\")) {
        searchTerms.push(server.command);
        if (IS_WIN) {
          searchTerms.push(server.command.replace(/\//g, "\\"));
        }
      }
    }
  }

  if (searchTerms.length === 0 && server.args.length > 0) {
    searchTerms.push(server.args[server.args.length - 1]);
  }

  return searchTerms;
}

/**
 * Find all processes matching a server's search terms, then group them
 * into connected clusters by parent-child relationships. Each cluster
 * represents one running server instance (the cmd.exe → npx → node chain).
 * Returns an array of clusters, each being a Set of PIDs.
 */
function findServerClusters(server, processes) {
  const searchTerms = getSearchTerms(server);
  if (searchTerms.length === 0) return [];

  // Find all PIDs whose command matches our search terms
  const matchingPids = new Set();
  for (const proc of processes) {
    for (const term of searchTerms) {
      if (proc.command.includes(term)) {
        matchingPids.add(proc.pid);
        break;
      }
    }
  }

  if (matchingPids.size === 0) return [];

  // Build parent-child maps (only among matching processes)
  // Two matching PIDs are in the same cluster if one is an ancestor of the other.
  const byPid = new Map();
  for (const p of processes) byPid.set(p.pid, p);

  // For each matching PID, walk up through parents to find if it connects
  // to another matching PID. Union-Find style grouping.
  const clusterOf = new Map(); // pid → cluster index
  const clusters = [];         // array of Set<pid>

  for (const pid of matchingPids) {
    // Check if any ancestor (within a reasonable depth) is already clustered
    let cur = pid;
    let foundCluster = -1;
    const chain = [pid];
    for (let depth = 0; depth < 20; depth++) {
      const proc = byPid.get(cur);
      if (!proc || !proc.ppid) break;
      cur = proc.ppid;
      if (matchingPids.has(cur)) {
        chain.push(cur);
        if (clusterOf.has(cur)) {
          foundCluster = clusterOf.get(cur);
          break;
        }
      }
    }

    if (foundCluster >= 0) {
      // Add this PID (and any intermediate matches) to existing cluster
      for (const p of chain) {
        if (matchingPids.has(p)) {
          clusters[foundCluster].add(p);
          clusterOf.set(p, foundCluster);
        }
      }
    } else {
      // Start a new cluster
      const idx = clusters.length;
      const cluster = new Set();
      for (const p of chain) {
        if (matchingPids.has(p)) {
          cluster.add(p);
          clusterOf.set(p, idx);
        }
      }
      clusters.push(cluster);
    }
  }

  return clusters;
}

function refreshStatuses(servers) {
  const start = Date.now();
  const processes = getRunningProcesses();
  // Track which clusters have been assigned to avoid giving two config
  // entries PIDs from the same server instance.
  const claimedPids = new Set();
  const statusSummary = [];

  for (const server of servers) {
    const clusters = findServerClusters(server, processes);

    // Find the first cluster that hasn't been claimed yet
    let assigned = null;
    for (const cluster of clusters) {
      const allClaimed = [...cluster].every((p) => claimedPids.has(p));
      if (!allClaimed) {
        assigned = cluster;
        break;
      }
    }

    if (assigned) {
      // Pick the ROOT PID of the cluster (the one whose parent is NOT in the
      // cluster) for display purposes.
      let displayPid = [...assigned][0]; // fallback
      for (const p of assigned) {
        const proc = processes.find((pr) => pr.pid === p);
        if (proc && (!proc.ppid || !assigned.has(proc.ppid))) {
          displayPid = p;
          break;
        }
      }
      const proc = processes.find((p) => p.pid === displayPid);

      server.status = "running";
      server.pid = displayPid;
      // Store ALL PIDs in this cluster so killServer can target them
      // individually without using tree-kill (/T), which can cascade
      // into sibling server processes that share a common ancestor.
      server.clusterPids = [...assigned];
      server.processInfo =
        proc && proc.cpu !== "-" ? `CPU: ${proc.cpu}%  MEM: ${proc.mem}%` : "";

      // Claim all PIDs in this cluster
      for (const p of assigned) claimedPids.add(p);
      statusSummary.push(`${server.tool}/${server.name}=RUNNING(pid=${displayPid},cluster=${[...assigned].join("+")})`);
    } else {
      server.status = "stopped";
      server.pid = null;
      server.clusterPids = [];
      server.processInfo = "";
      statusSummary.push(`${server.tool}/${server.name}=STOPPED`);
    }
  }

  // ── Shared-process detection ───────────────────────────────────────────
  // Two config entries (possibly from different tools) that resolve to the
  // same running process are "shared".  For example Cursor and GitHub
  // Copilot may both list the same npx server — Cursor spawns it once and
  // both tools use that single process.  We detect this by comparing the
  // display PID across all running servers.
  //
  // For servers that are stopped but have an identical command signature to
  // a running server in another tool, we also mark them as shared so the
  // user understands why they can't run independently.

  // Build a command signature for each server (command + sorted args)
  function cmdSignature(s) {
    return `${s.command}::${[...s.args].sort().join("::")}`;
  }

  // Group running servers by PID
  const pidToServers = new Map();
  for (const s of servers) {
    if (s.status === "running" && s.pid) {
      if (!pidToServers.has(s.pid)) pidToServers.set(s.pid, []);
      pidToServers.get(s.pid).push(s);
    }
  }

  // Group all servers by command signature
  const sigToServers = new Map();
  for (const s of servers) {
    const sig = cmdSignature(s);
    if (!sigToServers.has(sig)) sigToServers.set(sig, []);
    sigToServers.get(sig).push(s);
  }

  // Clear previous shared info
  for (const s of servers) {
    s.sharedWith = [];
  }

  // Mark servers sharing the same PID
  for (const [, group] of pidToServers) {
    if (group.length > 1) {
      for (const s of group) {
        s.sharedWith = group
          .filter((o) => o !== s)
          .map((o) => `${o.tool}/${o.name}`);
      }
    }
  }

  // Mark stopped servers that share a command signature with a running
  // server in a different tool (they're backed by the same process but
  // only one tool "owns" it from the OS perspective).
  for (const [, group] of sigToServers) {
    if (group.length < 2) continue;
    const running = group.filter((s) => s.status === "running");
    const stopped = group.filter((s) => s.status === "stopped");
    if (running.length > 0 && stopped.length > 0) {
      for (const s of stopped) {
        // Only mark if the match is across different tools
        const crossTool = running.filter((r) => r.tool !== s.tool);
        if (crossTool.length > 0) {
          s.sharedWith = crossTool.map((r) => `${r.tool}/${r.name}`);
          s.sharedPid = crossTool[0].pid;
        }
      }
    }
  }

  const elapsed = Date.now() - start;
  fileLog("DEBUG", `refreshStatuses completed in ${elapsed}ms`, statusSummary);
}

// ── Process Management (Cross-Platform) ─────────────────────────────────────

function killServer(server) {
  if (!server.pid) {
    fileLog("WARN", `killServer called for ${server.tool}/${server.name} but no PID`);
    return { success: false, message: "No PID found" };
  }

  const displayPid = server.pid;
  // Use the cluster PIDs (all PIDs belonging to THIS server's process group)
  // so we can kill them individually without /T, which avoids cascading into
  // sibling servers that share a common ancestor process.
  const pidsToKill = (server.clusterPids && server.clusterPids.length > 0)
    ? [...server.clusterPids]
    : [server.pid];

  fileLog("INFO", `killServer: ${server.tool}/${server.name} display=${displayPid} cluster=[${pidsToKill.join(",")}]`);

  try {
    if (IS_WIN || IS_WSL) {
      const taskkill = IS_WSL ? "taskkill.exe" : "taskkill";
      let killed = 0;
      const errors = [];

      // Kill each PID individually (/F = force, NO /T = no tree kill).
      // This prevents killing sibling server processes that may share
      // a common parent (e.g. Cursor spawning multiple MCP servers).
      for (const pid of pidsToKill) {
        try {
          const cmd = `${taskkill} /PID ${pid} /F`;
          fileLog("DEBUG", `Executing: ${cmd}`);
          execSync(cmd, {
            timeout: 10000,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
          killed++;
        } catch (e) {
          // PID may already be dead (child exited when parent was killed) — that's OK
          const msg = (e.stderr || e.stdout || "").toString().trim();
          if (!msg.includes("not found")) {
            errors.push(`PID ${pid}: ${msg || e.message}`);
          }
          fileLog("DEBUG", `Kill PID ${pid} error (may be expected): ${msg}`);
        }
      }

      server.status = "stopped";
      server.pid = null;
      server.clusterPids = [];
      const detail = `${killed}/${pidsToKill.length} process(es) killed`;
      fileLog("INFO", `Kill complete: ${server.name} — ${detail}`, { errors });
      return {
        success: killed > 0 || errors.length === 0,
        message: `Killed ${server.name} (PID ${displayPid}) — ${detail}`,
      };
    } else {
      const pid = server.pid;
      try {
        execSync(`pkill -TERM -P ${pid}`, { timeout: 3000, stdio: "pipe" });
      } catch {}
      try { process.kill(pid, "SIGTERM"); } catch {}
      setTimeout(() => {
        try {
          process.kill(pid, 0);
          try { execSync(`pkill -KILL -P ${pid}`, { timeout: 3000, stdio: "pipe" }); } catch {}
          process.kill(pid, "SIGKILL");
        } catch {}
      }, 2000);
      server.status = "stopped";
      server.pid = null;
      server.clusterPids = [];
      fileLog("INFO", `Kill success (Unix): ${server.name} PID ${pid}`);
      return { success: true, message: `Killed ${server.name} (PID ${pid})` };
    }
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : "";
    const stdout = e.stdout ? e.stdout.toString().trim() : "";
    const errDetail = stderr || stdout || e.message;
    fileLog("ERROR", `Kill failed: ${server.name} PID ${displayPid}`, { exit: e.status, error: errDetail });
    server.status = "stopped";
    server.pid = null;
    server.clusterPids = [];
    return {
      success: false,
      message: `Kill PID ${displayPid}: exit=${e.status} err="${errDetail}"`,
    };
  }
}

function startServer(server) {
  fileLog("INFO", `startServer: ${server.tool}/${server.name} cmd="${server.command}" args=${JSON.stringify(server.args)}`);
  const env = { ...process.env, ...server.env };

  const spawnOpts = {
    env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: !IS_WIN && !IS_WSL,
  };

  let cmd = server.command;
  let args = server.args;

  if (IS_WIN) {
    spawnOpts.shell = true;
    spawnOpts.windowsHide = true;
  } else if (IS_WSL) {
    // Spawn via cmd.exe so the process runs on the Windows side
    // where the AI agents expect to find it.
    const fullCmd = [server.command, ...server.args].join(" ");
    cmd = "cmd.exe";
    args = ["/C", fullCmd];
    spawnOpts.shell = false;
    fileLog("DEBUG", `WSL spawn: cmd.exe /C "${fullCmd}"`);
  }

  try {
    const child = spawn(cmd, args, spawnOpts);

    if (!IS_WIN && !IS_WSL) {
      child.unref();
    }

    server.pid = child.pid;
    server.status = "running";

    child.on("error", (err) => {
      fileLog("ERROR", `Server process error: ${server.name}`, err);
      server.status = "stopped";
      server.pid = null;
    });

    child.on("exit", (code, signal) => {
      fileLog("INFO", `Server process exited: ${server.name} code=${code} signal=${signal}`);
    });

    fileLog("INFO", `Started ${server.name} PID=${child.pid}`);
    return {
      success: true,
      message: `Started ${server.name} (PID ${child.pid})`,
    };
  } catch (e) {
    fileLog("ERROR", `Failed to start ${server.name}`, e);
    return { success: false, message: `Failed to start: ${e.message}` };
  }
}

// ── TUI Application ─────────────────────────────────────────────────────────

function createApp() {
  const screen = blessed.screen({
    smartCSR: true,
    title: "MCP Server Manager",
    fullUnicode: true,
  });

  let servers = loadAllServers();
  refreshStatuses(servers);
  let selectedRow = 0;
  let lastRefreshTime = new Date();

  /**
   * Re-scan config files and merge newly discovered servers into the list.
   * Preserves runtime state (pid, status, processInfo) for existing entries.
   * Removes servers whose config entries have been deleted.
   * Returns the count of new servers added.
   */
  function reloadServers() {
    const fresh = loadAllServers();
    const existingByKey = new Map();
    for (const s of servers) {
      const key = `${path.resolve(s.configPath)}::${s.name}`;
      existingByKey.set(key, s);
    }

    let added = 0;
    let removed = 0;
    const freshKeys = new Set();

    for (const f of fresh) {
      const key = `${path.resolve(f.configPath)}::${f.name}`;
      freshKeys.add(key);
      if (!existingByKey.has(key)) {
        servers.push(f);
        added++;
      }
    }

    // Remove servers that no longer exist in any config
    const before = servers.length;
    servers = servers.filter((s) => {
      const key = `${path.resolve(s.configPath)}::${s.name}`;
      return freshKeys.has(key);
    });
    removed = before - servers.length;

    return { added, removed };
  }

  // ── Header ──────────────────────────────────────────────────────────────

  const header = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    content: "",
    tags: true,
    style: { fg: "white", bg: "blue" },
  });

  function updateHeader() {
    const running = servers.filter((s) => s.status === "running").length;
    const stopped = servers.filter((s) => s.status === "stopped").length;
    const shared = servers.filter((s) => s.sharedWith && s.sharedWith.length > 0).length;
    const total = servers.length;
    const agents = [...new Set(servers.map((s) => s.tool))];
    const refreshAgo = Math.round((Date.now() - lastRefreshTime.getTime()) / 1000);
    const refreshStr = refreshAgo < 2 ? "just now" : `${refreshAgo}s ago`;
    const sharedStr = shared > 0 ? `  {magenta-fg}~ ${shared} Shared{/}` : "";
    header.setContent(
      `{center}{bold}  MCP Server Manager{/bold}{/center}\n` +
        `{center}{green-fg}* ${running} Running{/}  {red-fg}o ${stopped} Stopped{/}${sharedStr}  ` +
        `Total: ${total}  |  Agents: ${agents.join(", ") || "none found"}` +
        `  |  {gray-fg}Refreshed: ${refreshStr}{/}{/center}`
    );
  }

  // ── Server Table ────────────────────────────────────────────────────────

  const tableBox = blessed.box({
    top: 3,
    left: 0,
    width: "100%",
    height: "100%-10",
    border: { type: "line" },
    label: " Servers (up/down navigate) ",
    tags: true,
    style: {
      border: { fg: "cyan" },
      label: { fg: "cyan", bold: true },
    },
  });

  const tableHeader = blessed.box({
    top: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    tags: true,
    content: "",
    style: { fg: "white", bg: "gray", bold: true },
    parent: tableBox,
  });

  const tableList = blessed.list({
    top: 1,
    left: 0,
    width: "100%-2",
    height: "100%-3",
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollbar: { ch: "|", style: { fg: "cyan" } },
    style: {
      selected: { bg: "blue", fg: "white", bold: true },
      item: { fg: "white" },
    },
    parent: tableBox,
  });

  // Column widths — fixed columns
  const COL = {
    name: 18,
    status: 12,
    pid: 8,
    type: 8,
    cmd: 20,
  };
  const fixedW =
    COL.name + COL.status + COL.pid + COL.type + COL.cmd + 9;

  // Dynamic columns share remaining space: 35% agent, 65% config path
  function dynamicWidths(totalW) {
    const remaining = Math.max(30, totalW - fixedW);
    const agent = Math.max(14, Math.min(30, Math.floor(remaining * 0.35)));
    const cfgPath = remaining - agent;
    return { agent, cfgPath };
  }

  function formatRow(server, width) {
    const dyn = dynamicWidths(width);

    const agent = server.tool.padEnd(dyn.agent).slice(0, dyn.agent);
    const name = server.name.padEnd(COL.name).slice(0, COL.name);

    const isShared = server.sharedWith && server.sharedWith.length > 0;

    let statusTag;
    if (server.status === "running" && isShared) {
      statusTag = "{green-fg}* SHARED{/} ".padEnd(COL.status + 17);
    } else if (server.status === "running") {
      statusTag = "{green-fg}* RUNNING{/}".padEnd(COL.status + 18);
    } else if (server.status === "stopped" && isShared) {
      statusTag = "{magenta-fg}~ SHARED{/} ".padEnd(COL.status + 18);
    } else if (server.status === "stopped") {
      statusTag = "{red-fg}o STOPPED{/}".padEnd(COL.status + 16);
    } else {
      statusTag = "{yellow-fg}? UNKNOWN{/}".padEnd(COL.status + 18);
    }

    const displayPid = server.pid || server.sharedPid;
    const pid = (displayPid ? String(displayPid) : "-").padEnd(COL.pid);
    const type = server.type.padEnd(COL.type).slice(0, COL.type);

    const isNpx =
      server.command === "npx" ||
      server.command === "npx.cmd" ||
      server.command.endsWith("\\npx.cmd") ||
      server.command.endsWith("/npx");

    let cmdStr;
    if (isNpx) {
      const pkg = server.args.find(
        (a) => a.startsWith("@") || a.includes("/")
      );
      cmdStr = pkg
        ? `npx ${pkg}`
        : `npx ${server.args.slice(0, 2).join(" ")}`;
    } else {
      cmdStr = path.basename(server.command);
    }
    cmdStr = cmdStr.padEnd(COL.cmd).slice(0, COL.cmd);

    const cfgPath = abbreviatePath(server.configPath, dyn.cfgPath)
      .padEnd(dyn.cfgPath)
      .slice(0, dyn.cfgPath);

    return ` ${agent} ${name} ${statusTag} ${pid} ${cmdStr} ${type} ${cfgPath}`;
  }

  function formatHeaderRow(width) {
    const dyn = dynamicWidths(width);
    return (
      ` ${"AGENT".padEnd(dyn.agent)} ${"SERVER".padEnd(COL.name)} ${"STATUS".padEnd(COL.status)} ` +
      `${"PID".padEnd(COL.pid)} ${"COMMAND".padEnd(COL.cmd)} ${"TYPE".padEnd(COL.type)} ` +
      `${"CONFIG PATH".padEnd(dyn.cfgPath)}`
    );
  }

  function updateTable() {
    const width = tableBox.width - 2;
    tableHeader.setContent(`{bold}${formatHeaderRow(width)}{/bold}`);

    const sorted = [...servers].sort((a, b) => {
      const toolCmp = a.tool.localeCompare(b.tool);
      if (toolCmp !== 0) return toolCmp;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    servers = sorted;

    const items = servers.map((s) => formatRow(s, width));
    tableList.setItems(items);

    if (selectedRow >= servers.length) selectedRow = servers.length - 1;
    if (selectedRow < 0) selectedRow = 0;
    tableList.select(selectedRow);
  }

  // ── Activity Log ────────────────────────────────────────────────────────

  const logBox = blessed.log({
    bottom: 1,
    left: 0,
    width: "100%",
    height: 7,
    border: { type: "line" },
    label: " Activity Log ",
    tags: true,
    scrollbar: { ch: "|", style: { fg: "yellow" } },
    style: {
      border: { fg: "yellow" },
      label: { fg: "yellow", bold: true },
    },
  });

  function log(msg) {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    logBox.log(`{gray-fg}${ts}{/} ${msg}`);
    fileLog("INFO", `[TUI] ${stripTags(msg)}`);
    screen.render();
  }

  // ── Footer ──────────────────────────────────────────────────────────────

  const footer = blessed.box({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { fg: "white", bg: "blue" },
    content:
      " {bold}r{/} Restart  {bold}k{/} Kill  {bold}K{/} Kill All  {bold}a{/} Restart All Stopped  {bold}F5{/} Refresh  {bold}d{/} Details  {bold}q{/} Quit",
  });

  // ── Detail Popup ────────────────────────────────────────────────────────

  const detailPopup = blessed.box({
    top: "center",
    left: "center",
    width: "70%",
    height: "65%",
    border: { type: "line" },
    label: " Server Details ",
    tags: true,
    hidden: true,
    scrollable: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollbar: { ch: "|", style: { fg: "cyan" } },
    style: {
      border: { fg: "green" },
      label: { fg: "green", bold: true },
      bg: "black",
    },
  });

  function showDetail(server) {
    const envLines = Object.entries(server.env)
      .map(([k, v]) => {
        const sensitive = /token|key|password|secret|api/i;
        const display = sensitive.test(k)
          ? v.slice(0, 6) + "******" + v.slice(-4)
          : v;
        return `    {cyan-fg}${k}{/}: ${display}`;
      })
      .join("\n");

    const isShared = server.sharedWith && server.sharedWith.length > 0;
    let statusStr;
    if (server.status === "running" && isShared) {
      statusStr = "{green-fg}* SHARED{/} {gray-fg}(process shared with " + server.sharedWith.join(", ") + "){/}";
    } else if (server.status === "running") {
      statusStr = "{green-fg}* RUNNING{/}";
    } else if (server.status === "stopped" && isShared) {
      statusStr = "{magenta-fg}~ SHARED{/} {gray-fg}(process owned by " + server.sharedWith.join(", ") + "){/}";
    } else {
      statusStr = "{red-fg}o STOPPED{/}";
    }

    const displayPid = server.pid || server.sharedPid;

    const content = [
      `  {bold}Agent:{/}       ${server.tool}`,
      `  {bold}Name:{/}        ${server.name}`,
      `  {bold}Status:{/}      ${statusStr}`,
      `  {bold}PID:{/}         ${displayPid || "-"}`,
      `  {bold}Type:{/}        ${server.type}`,
      `  {bold}Source:{/}      ${server.source}`,
      `  {bold}Config Path:{/} ${abbreviatePath(server.configPath)}`,
      `  {bold}Full Path:{/}   ${path.resolve(server.configPath)}`,
      `  {bold}Command:{/}     ${server.command} ${server.args.join(" ")}`,
      `  {bold}Resources:{/}   ${server.processInfo || "-"}`,
      ...(isShared ? [
        ``,
        `  {bold}Shared With:{/}`,
        ...server.sharedWith.map((s) => `    {magenta-fg}${s}{/}`),
        `  {gray-fg}This server shares a process with the above.{/}`,
        `  {gray-fg}Killing it will affect all linked servers.{/}`,
      ] : []),
      ``,
      `  {bold}Environment:{/}`,
      envLines || "    (none)",
      ``,
      `  {gray-fg}Press Escape or Enter to close{/}`,
    ].join("\n");

    detailPopup.setContent(content);
    detailPopup.show();
    detailPopup.focus();
    screen.render();
  }

  // ── Assemble Screen ─────────────────────────────────────────────────────

  screen.append(header);
  screen.append(tableBox);
  screen.append(logBox);
  screen.append(footer);
  screen.append(detailPopup);

  // ── Key Bindings ────────────────────────────────────────────────────────

  tableList.on("select item", (item, index) => {
    selectedRow = index;
  });

  detailPopup.key(["escape", "enter", "q"], () => {
    detailPopup.hide();
    tableList.focus();
    screen.render();
  });

  screen.key(["q", "C-c"], () => process.exit(0));

  screen.key(["f5"], () => {
    log("Refreshing configs and server status...");
    const { added, removed } = reloadServers();
    refreshStatuses(servers);
    lastRefreshTime = new Date();
    updateTable();
    updateHeader();
    const parts = ["{green-fg}Refresh complete.{/}"];
    if (added > 0) parts.push(`{cyan-fg}+${added} new server(s) found.{/}`);
    if (removed > 0) parts.push(`{yellow-fg}-${removed} server(s) removed.{/}`);
    log(parts.join("  "));
  });

  screen.key(["r"], () => {
    if (detailPopup.visible) return;
    const server = servers[selectedRow];
    if (!server) return;

    log(`Restarting {bold}${server.tool} / ${server.name}{/}...`);

    if (server.status === "running") {
      const killResult = killServer(server);
      log(`  ${killResult.message}`);
    }

    setTimeout(() => {
      const startResult = startServer(server);
      if (startResult.success) {
        log(`{green-fg}${startResult.message}{/}`);
      } else {
        log(`{red-fg}${startResult.message}{/}`);
      }
      setTimeout(() => {
        refreshStatuses(servers);
        lastRefreshTime = new Date();
        updateTable();
        updateHeader();
        screen.render();
      }, 1500);
    }, 1000);
  });

  screen.key(["k"], () => {
    if (detailPopup.visible) return;
    const server = servers[selectedRow];
    if (!server) return;

    if (server.status !== "running") {
      log(`{yellow-fg}${server.tool} / ${server.name} is not running.{/}`);
      return;
    }

    log(`Killing {bold}${server.tool} / ${server.name}{/} (PID ${server.pid})...`);
    const result = killServer(server);
    if (result.success) {
      log(`{green-fg}${result.message}{/}`);
    } else {
      log(`{red-fg}${result.message}{/}`);
    }
    // Immediately update the table to show stopped status
    updateTable();
    updateHeader();
    screen.render();

    // Then verify with a full process refresh after a delay
    setTimeout(() => {
      refreshStatuses(servers);
      lastRefreshTime = new Date();
      updateTable();
      updateHeader();
      screen.render();
    }, 3000);
  });

  screen.key(["K"], () => {
    if (detailPopup.visible) return;
    const running = servers.filter((s) => s.status === "running");
    if (running.length === 0) {
      log("{yellow-fg}No running servers to kill.{/}");
      return;
    }

    log(`Killing all ${running.length} running server(s)...`);
    const killedPids = new Set();
    let killed = 0;
    let failed = 0;

    for (const server of running) {
      const pids = server.clusterPids && server.clusterPids.length > 0
        ? server.clusterPids
        : server.pid
          ? [server.pid]
          : [];
      const alreadyKilled = pids.length > 0 && pids.some((pid) => killedPids.has(pid));
      if (alreadyKilled) continue;

      const result = killServer(server);
      if (result.success) {
        killed++;
        log(`  {green-fg}${result.message}{/}`);
      } else {
        failed++;
        log(`  {red-fg}${result.message}{/}`);
      }
      for (const pid of pids) killedPids.add(pid);
    }

    updateTable();
    updateHeader();
    screen.render();

    setTimeout(() => {
      refreshStatuses(servers);
      lastRefreshTime = new Date();
      updateTable();
      updateHeader();
      const summary = failed === 0
        ? `{green-fg}Kill all complete: ${killed} server(s) stopped.{/}`
        : `{yellow-fg}Kill all complete: ${killed} killed, ${failed} failed.{/}`;
      log(summary);
      screen.render();
    }, 3000);
  });

  screen.key(["a"], () => {
    if (detailPopup.visible) return;
    const stopped = servers.filter((s) => s.status === "stopped");
    if (stopped.length === 0) {
      log("{yellow-fg}No stopped servers to restart.{/}");
      return;
    }

    log(`Restarting ${stopped.length} stopped server(s)...`);
    let idx = 0;

    function restartNext() {
      if (idx >= stopped.length) {
        setTimeout(() => {
          refreshStatuses(servers);
          lastRefreshTime = new Date();
          updateTable();
          updateHeader();
          log("{green-fg}All restart attempts complete.{/}");
          screen.render();
        }, 1500);
        return;
      }

      const server = stopped[idx++];
      const result = startServer(server);
      if (result.success) {
        log(`  {green-fg}${result.message}{/}`);
      } else {
        log(`  {red-fg}${result.message}{/}`);
      }
      setTimeout(restartNext, 500);
    }

    restartNext();
  });

  screen.key(["d"], () => {
    if (detailPopup.visible) {
      detailPopup.hide();
      tableList.focus();
      screen.render();
      return;
    }
    const server = servers[selectedRow];
    if (server) showDetail(server);
  });

  screen.on("resize", () => {
    updateTable();
    updateHeader();
    screen.render();
  });

  // ── Auto-refresh ────────────────────────────────────────────────────────

  // On WSL the PowerShell query takes 3-4 seconds, so use a longer interval
  // to avoid freezing the UI constantly.
  // On WSL the PowerShell query takes 3-4s, so use a longer interval.
  // A secondary 1-second tick updates the header's "refreshed Xs ago" display
  // so the user can see that polling is active without expensive process checks.
  const REFRESH_MS = IS_WSL ? 15000 : 5000;
  setInterval(() => {
    const { added, removed } = reloadServers();
    refreshStatuses(servers);
    lastRefreshTime = new Date();
    updateTable();
    updateHeader();
    if (added > 0) log(`{cyan-fg}Auto-detected +${added} new server(s).{/}`);
    if (removed > 0) log(`{yellow-fg}Auto-detected -${removed} removed server(s).{/}`);
    screen.render();
  }, REFRESH_MS);

  // Lightweight header tick — just updates the "refreshed Xs ago" counter.
  setInterval(() => {
    updateHeader();
    screen.render();
  }, 1000);

  // ── Initial Render ──────────────────────────────────────────────────────

  updateHeader();
  updateTable();
  tableList.focus();

  const allAgents = [...new Set(servers.map((s) => s.tool))];
  const platform = IS_WIN ? "Windows" : IS_MAC ? "macOS" : IS_WSL ? "WSL (Windows)" : "Linux";
  log(
    `MCP Server Manager started on {bold}${platform}{/}. ` +
      `Found {bold}${servers.length}{/} server(s) across {bold}${allAgents.join(", ") || "no agents"}{/}.`
  );
  log(
    "Keys: {bold}r{/} restart, {bold}k{/} kill, {bold}K{/} kill all, {bold}a{/} restart all stopped, {bold}F5{/} refresh, {bold}d{/} details."
  );
  screen.render();
}

// ── Global Error Handlers ────────────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  fileLog("ERROR", "Uncaught exception", err);
  // Attempt to write a final message before exit
  try {
    fs.appendFileSync(LOG_FILE,
      `[${new Date().toISOString()}] [FATAL] Process crashing due to uncaught exception\n`);
  } catch {}
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  fileLog("ERROR", "Unhandled promise rejection", reason instanceof Error ? reason : { reason });
});

// Log environment summary for diagnostics
fileLog("INFO", "Environment", {
  platform: process.platform,
  nodeVersion: process.version,
  isWSL: IS_WSL,
  isWin: IS_WIN,
  isMac: IS_MAC,
  home: HOME,
  winHome: WIN_HOME || "(n/a)",
  appdata: APPDATA || "(n/a)",
  cwd: process.cwd(),
});

// ── Entry Point ─────────────────────────────────────────────────────────────

createApp();
