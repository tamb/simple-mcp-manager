const path = require("node:path");

function isRemoteType(type) {
  return type === "http" || type === "https" || type === "sse";
}

/**
 * Format command display string for table rows.
 * @param {object} server
 * @returns {string}
 */
function formatCommandDisplay(server) {
  if (isRemoteType(server.type)) {
    if (server.url) {
      try {
        return new URL(server.url).hostname;
      } catch {
        return server.type.toUpperCase();
      }
    }
    return server.type === "sse" ? "SSE" : "HTTP";
  }

  const isNpx =
    server.command === "npx" ||
    server.command === "npx.cmd" ||
    server.command.endsWith("\\npx.cmd") ||
    server.command.endsWith("/npx");

  if (isNpx) {
    const pkg = server.args.find(
      (a) => a.startsWith("@") || (!a.startsWith("-") && a.includes("/")),
    );
    return pkg ? `npx ${pkg}` : `npx ${server.args.slice(0, 2).join(" ")}`;
  }

  return path.basename(server.command) || "-";
}

/**
 * Human-readable status label for UI.
 * @param {object} server
 * @returns {{ text: string, isShared: boolean }}
 */
function getStatusDisplay(server) {
  const isShared = server.sharedWith && server.sharedWith.length > 0;

  if (server.status === "http-ok") {
    return { text: "≡ HTTP OK", isShared: false };
  }
  if (server.status === "http-down") {
    return { text: "× HTTP DOWN", isShared: false };
  }
  if (server.status === "http-unknown") {
    return { text: "? HTTP", isShared: false };
  }
  if (server.status === "http") {
    return { text: "≡ HTTP", isShared: false };
  }
  if (server.status === "running" && isShared) {
    return { text: "* SHARED", isShared: true };
  }
  if (server.status === "running") {
    return { text: "* RUNNING", isShared: false };
  }
  if (server.status === "starting") {
    return { text: "… STARTING", isShared: false };
  }
  if (server.status === "stopping") {
    return { text: "… STOPPING", isShared: false };
  }
  if (server.status === "stopped" && isShared) {
    return { text: "~ SHARED", isShared: true };
  }
  if (server.status === "stopped") {
    return { text: "o STOPPED", isShared: false };
  }
  return { text: "? UNKNOWN", isShared: false };
}

/**
 * Blessed tag color for a server status cell.
 * @param {object} server
 * @returns {string}
 */
function getTuiStatusColor(server) {
  if (server.status === "http" || server.status === "http-ok") return "blue-fg";
  if (server.status === "http-down") return "red-fg";
  if (String(server.status).startsWith("http")) return "yellow-fg";
  if (server.status === "running") return "green-fg";
  if (server.status === "starting") return "cyan-fg";
  if (server.status === "stopping") return "yellow-fg";
  if (server.status === "stopped" && server.sharedWith?.length) return "magenta-fg";
  if (server.status === "stopped") return "red-fg";
  return "yellow-fg";
}

module.exports = {
  formatCommandDisplay,
  getStatusDisplay,
  getTuiStatusColor,
  isRemoteType,
};
