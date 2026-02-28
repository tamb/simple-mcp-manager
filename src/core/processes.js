"use strict";

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");
const { fileLog } = require("../utils/logger");
const { IS_WIN, IS_WSL } = require("../config/constants");

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
    // HTTP servers don't have local processes - they're external HTTP endpoints
    if (server.type === "http" || server.type === "https") {
      server.status = "http";
      server.pid = null;
      server.clusterPids = [];
      server.processInfo = server.url || "";
      statusSummary.push(`${server.tool}/${server.name}=HTTP(endpoint)`);
      continue;
    }

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
      server.logsCapturing = false;
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
      server.logsCapturing = false;
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
    server.logsCapturing = false;
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
    server.logsCapturing = true;
    server.logs = [];
    const maxLogs = 500;

    // Capture stdout
    child.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          server.logs.push({ ts: Date.now(), type: "out", line });
          if (server.logs.length > maxLogs) server.logs.shift();
        }
      }
    });

    // Capture stderr
    child.stderr.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          server.logs.push({ ts: Date.now(), type: "err", line });
          if (server.logs.length > maxLogs) server.logs.shift();
        }
      }
    });

    child.on("error", (err) => {
      fileLog("ERROR", `Server process error: ${server.name}`, err);
      server.status = "stopped";
      server.pid = null;
      server.logsCapturing = false;
    });

    child.on("exit", (code, signal) => {
      fileLog("INFO", `Server process exited: ${server.name} code=${code} signal=${signal}`);
      server.logsCapturing = false;
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

module.exports = {
  getRunningProcesses,
  getRunningProcessesUnix,
  getRunningProcessesWSL,
  getRunningProcessesWindows,
  getRunningProcessesPowerShell,
  getSearchTerms,
  findServerClusters,
  refreshStatuses,
  killServer,
  startServer,
};
