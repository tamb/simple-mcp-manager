const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { fileLog } = require("../../utils/logger");
const { sanitizeServerForApi } = require("../../utils/sanitize");
const { IS_WIN, IS_MAC, IS_WSL, HOME } = require("../../config/constants");
const { loadAllServers } = require("../../core/discovery");
const { reloadServers, findServerById, sortServers } = require("../../core/serverState");
const {
  restartServer,
  killServerAction,
  killAllRunning,
  restartAllStopped,
  exportServerLogs,
} = require("../../core/actions");
const { refreshStatuses, probeHttpEndpoints } = require("../../core/processes");

const STATIC_DIR = path.join(__dirname, "static");
const REFRESH_MS = IS_WSL ? 15000 : 5000;

/**
 * Find an available port starting from the given port.
 */
async function findAvailablePort(startPort, maxAttempts = 10) {
  return new Promise((resolve, reject) => {
    function tryPort(port, attemptsLeft) {
      if (attemptsLeft <= 0) {
        reject(new Error(`Could not find available port after ${maxAttempts} attempts`));
        return;
      }

      const server = net.createServer();
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolve(port));
      });
      server.on("error", () => {
        tryPort(port + 1, attemptsLeft - 1);
      });
    }

    tryPort(startPort, maxAttempts);
  });
}

function getMimeType(filePath) {
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "application/javascript";
  if (filePath.endsWith(".html")) return "text/html";
  return "application/octet-stream";
}

function serveStatic(pathname, res) {
  let filePath = pathname;
  if (filePath === "/") filePath = "/index.html";
  const fullPath = path.join(STATIC_DIR, filePath);

  if (!fullPath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }

  if (!fs.existsSync(fullPath)) {
    return false;
  }

  res.writeHead(200, { "Content-Type": getMimeType(fullPath) });
  res.end(fs.readFileSync(fullPath));
  return true;
}

/** Reserved API path segments — must not be treated as server ids. */
const RESERVED_SERVER_IDS = new Set(["kill-all", "restart-all-stopped"]);

function parseServerIdFromPath(pathname, action) {
  const match = pathname.match(new RegExp(`^/api/servers/(.+)/${action}$`));
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  if (RESERVED_SERVER_IDS.has(id)) return null;
  return id;
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

/**
 * Create and start the web UI HTTP server.
 * @param {number} preferredPort
 */
async function createWebApp(preferredPort = 3000) {
  fileLog("INFO", "Starting Web UI mode", { preferredPort });

  let servers = loadAllServers();
  refreshStatuses(servers);
  probeHttpEndpoints(servers).catch(() => {});
  let lastRefreshTime = new Date();

  async function refreshAll() {
    const result = reloadServers(servers);
    servers = result.servers;
    refreshStatuses(servers);
    await probeHttpEndpoints(servers);
    lastRefreshTime = new Date();
    return result;
  }

  setInterval(() => {
    refreshAll()
      .then(({ added, removed }) => {
        if (added > 0) fileLog("INFO", `Web UI: Auto-detected +${added} new server(s)`);
        if (removed > 0) fileLog("INFO", `Web UI: Auto-detected -${removed} removed server(s)`);
      })
      .catch((err) => fileLog("ERROR", "Web UI refresh failed", err));
  }, REFRESH_MS);

  const port = await findAvailablePort(preferredPort);

  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    const method = req.method;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      if (serveStatic(pathname, res)) return;

      if (pathname === "/health" && method === "GET") {
        jsonResponse(res, 200, { status: "ok", servers: servers.length });
        return;
      }

      if (pathname === "/api/config" && method === "GET") {
        jsonResponse(res, 200, {
          refreshMs: REFRESH_MS,
          home: HOME,
          isWsl: IS_WSL,
          lastRefresh: lastRefreshTime.toISOString(),
        });
        return;
      }

      if (pathname === "/api/servers" && method === "GET") {
        refreshStatuses(servers);
        const sorted = sortServers(servers).map(sanitizeServerForApi);
        jsonResponse(res, 200, sorted);
        return;
      }

      const restartId = parseServerIdFromPath(pathname, "restart");
      if (restartId && method === "POST") {
        const target = findServerById(servers, restartId);
        if (!target) {
          jsonResponse(res, 404, { success: false, message: "Server not found" });
          return;
        }

        fileLog("INFO", `Web UI: Restarting ${target.tool}/${target.name}`);
        const result = await restartServer(target);
        await refreshAll();
        jsonResponse(res, 200, {
          success: result.success,
          message: result.success ? `Restarting ${target.tool}/${target.name}` : result.message,
        });
        return;
      }

      const killId = parseServerIdFromPath(pathname, "kill");
      if (killId && method === "POST") {
        const target = findServerById(servers, killId);
        if (!target) {
          jsonResponse(res, 404, { success: false, message: "Server not found" });
          return;
        }

        fileLog("INFO", `Web UI: Killing ${target.tool}/${target.name}`);
        const result = await killServerAction(target);
        await refreshAll();
        jsonResponse(res, 200, result);
        return;
      }

      if (pathname === "/api/servers/kill-all" && method === "POST") {
        const result = await killAllRunning(servers);
        await refreshAll();
        jsonResponse(res, 200, result);
        return;
      }

      if (pathname === "/api/servers/restart-all-stopped" && method === "POST") {
        const result = await restartAllStopped(servers);
        await refreshAll();
        jsonResponse(res, 200, result);
        return;
      }

      const detailsId = parseServerIdFromPath(pathname, "details");
      if (detailsId && method === "GET") {
        const target = findServerById(servers, detailsId);
        if (!target) {
          jsonResponse(res, 404, { success: false, message: "Server not found" });
          return;
        }
        jsonResponse(res, 200, sanitizeServerForApi(target, { includeLogs: true }));
        return;
      }

      const exportId = parseServerIdFromPath(pathname, "export-logs");
      if (exportId && method === "POST") {
        const target = findServerById(servers, exportId);
        if (!target) {
          jsonResponse(res, 404, { success: false, message: "Server not found" });
          return;
        }
        const result = exportServerLogs(target);
        jsonResponse(res, 200, result);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } catch (error) {
      fileLog("ERROR", `Web UI request error: ${pathname}`, error);
      jsonResponse(res, 500, { success: false, message: error.message });
    }
  });

  server.listen(port, "127.0.0.1", () => {
    const platform = IS_WIN ? "Windows" : IS_MAC ? "macOS" : IS_WSL ? "WSL (Windows)" : "Linux";
    fileLog("INFO", `Web UI server started on port ${port}`, { platform });

    console.log("");
    console.log("╔════════════════════════════════════════════════════════╗");
    console.log("║      MCP Server Manager - Web UI Mode                ║");
    console.log("╚════════════════════════════════════════════════════════╝");
    console.log("");
    console.log(`   Platform: ${platform}`);
    console.log(`   Servers:  ${servers.length} discovered`);
    console.log("");
    console.log(`   Web UI running at: http://localhost:${port}`);
    console.log("");
    console.log("   Open your browser and navigate to the URL above.");
    console.log("   Press Ctrl+C to stop the server.");
    console.log("");
  });

  process.on("SIGINT", () => {
    console.log("\n\nShutting down Web UI server...");
    fileLog("INFO", "Web UI shutting down (SIGINT)");
    server.close(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    fileLog("INFO", "Web UI shutting down (SIGTERM)");
    server.close(() => process.exit(0));
  });
}

module.exports = {
  findAvailablePort,
  createWebApp,
  parseServerIdFromPath,
  RESERVED_SERVER_IDS,
};
