const fs = require("node:fs");
const path = require("node:path");
const { killServerAsync, startServer } = require("./processes");

const KILL_VERIFY_MS = 3000;
const RESTART_KILL_DELAY_MS = 1000;
const RESTART_VERIFY_MS = 1500;
const RESTART_ALL_GAP_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttpServer(server) {
  return server.type === "http" || server.type === "https" || server.type === "sse";
}

/**
 * Restart a single stdio server (kill if running, then start).
 * @param {object} server
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function restartServer(server) {
  if (isHttpServer(server)) {
    return {
      success: false,
      message: "HTTP/SSE servers cannot be restarted — they are external endpoints",
    };
  }

  const wasRunning = server.status === "running";
  if (wasRunning) {
    server.status = "stopping";
    const killResult = await killServerAsync(server);
    if (!killResult.success) {
      return killResult;
    }
    await sleep(RESTART_KILL_DELAY_MS);
  }

  server.status = "starting";
  const startResult = startServer(server);
  await sleep(RESTART_VERIFY_MS);
  return startResult;
}

/**
 * Kill a single running server.
 * @param {object} server
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function killServerAction(server) {
  if (isHttpServer(server)) {
    return {
      success: false,
      message: "HTTP/SSE servers cannot be killed — they are external endpoints",
    };
  }

  if (server.status !== "running") {
    return { success: false, message: "Server is not running" };
  }

  server.status = "stopping";
  const result = await killServerAsync(server);
  await sleep(KILL_VERIFY_MS);
  return result;
}

/**
 * Kill all running servers, deduplicating shared PIDs.
 * @param {object[]} servers
 * @returns {Promise<{ success: boolean, message: string, killed: number, failed: number }>}
 */
async function killAllRunning(servers) {
  const running = servers.filter((s) => s.status === "running");
  if (running.length === 0) {
    return { success: false, message: "No running servers", killed: 0, failed: 0 };
  }

  for (const server of running) {
    server.status = "stopping";
  }

  const killedPids = new Set();
  let killed = 0;
  let failed = 0;

  for (const server of running) {
    const pids =
      server.clusterPids && server.clusterPids.length > 0
        ? server.clusterPids
        : server.pid
          ? [server.pid]
          : [];
    const alreadyKilled = pids.length > 0 && pids.some((pid) => killedPids.has(pid));
    if (alreadyKilled) continue;

    const result = await killServerAsync(server);
    if (result.success) killed++;
    else failed++;

    for (const pid of pids) killedPids.add(pid);
  }

  await sleep(KILL_VERIFY_MS);

  return {
    success: killed > 0,
    message: `Killed ${killed} server(s)${failed > 0 ? `, ${failed} failed` : ""}`,
    killed,
    failed,
  };
}

/**
 * Start all stopped stdio servers sequentially.
 * @param {object[]} servers
 * @returns {Promise<{ success: boolean, message: string, count: number }>}
 */
async function restartAllStopped(servers) {
  const stopped = servers.filter((s) => s.status === "stopped" && !isHttpServer(s));
  if (stopped.length === 0) {
    return { success: false, message: "No stopped servers", count: 0 };
  }

  for (const server of stopped) {
    server.status = "starting";
    startServer(server);
    await sleep(RESTART_ALL_GAP_MS);
  }

  await sleep(RESTART_VERIFY_MS);

  return {
    success: true,
    message: `Restarting ${stopped.length} stopped server(s)`,
    count: stopped.length,
  };
}

/**
 * Export captured logs to a file.
 * @param {object} server
 * @param {string} [destPath]
 * @returns {{ success: boolean, message: string, path?: string }}
 */
function exportServerLogs(server, destPath) {
  if (!server.logs || server.logs.length === 0) {
    return { success: false, message: "No logs to export" };
  }

  const safeName = server.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath =
    destPath || path.join(process.cwd(), "logs", `${server.tool}-${safeName}-${ts}.txt`);

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines = server.logs.map((entry) => {
    const time = new Date(entry.ts).toISOString();
    const stream = entry.stream || "stdout";
    return `[${time}] [${stream}] ${entry.line}`;
  });

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
  return { success: true, message: `Logs exported to ${filePath}`, path: filePath };
}

module.exports = {
  restartServer,
  killServerAction,
  killAllRunning,
  restartAllStopped,
  exportServerLogs,
  isHttpServer,
};
