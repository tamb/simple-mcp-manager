// State
let servers = [];
let selectedIndex = -1;
let sortColumn = "tool";
let sortDirection = "asc";
let lastRefreshTime = Date.now();
let isRefreshing = false;
let searchQuery = "";
let appConfig = { refreshMs: 5000, home: "" };
let actionInProgress = false;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const cfgRes = await fetch("/api/config");
    if (cfgRes.ok) appConfig = await cfgRes.json();
    const refreshLabel = document.getElementById("refresh-interval-label");
    if (refreshLabel) {
      refreshLabel.textContent = `Auto-refreshing every ${appConfig.refreshMs / 1000}s`;
    }
  } catch {}

  fetchServers();
  setupEventListeners();
  startAutoRefresh();
});

function getFilteredServers() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return servers;
  return servers.filter((s) => {
    const haystack = [s.name, s.tool, s.command, s.configPath, s.type, s.url, ...(s.args || [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function setActionButtonsDisabled(disabled) {
  ["btn-restart", "btn-kill", "btn-kill-all", "btn-restart-all", "btn-export-logs"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    },
  );
}

async function fetchServers() {
  if (isRefreshing) return;
  isRefreshing = true;
  document.getElementById("btn-refresh").disabled = true;

  try {
    const response = await fetch("/api/servers");
    if (!response.ok) throw new Error("Failed to fetch servers");
    servers = await response.json();
    if (selectedIndex >= servers.length) selectedIndex = servers.length - 1;
    renderTable();
    updateStats();
    lastRefreshTime = Date.now();
    updateRefreshTime();
  } catch (error) {
    log(`Failed to fetch servers: ${error.message}`, "error");
  } finally {
    isRefreshing = false;
    document.getElementById("btn-refresh").disabled = false;
  }
}

function statusDisplay(server) {
  const isShared = server.sharedWith && server.sharedWith.length > 0;
  if (server.status === "http-ok") return { cls: "status-running", text: "≡ HTTP OK" };
  if (server.status === "http-down") return { cls: "status-stopped", text: "× HTTP DOWN" };
  if (server.status === "http-unknown") return { cls: "status-unknown", text: "? HTTP" };
  if (server.status === "http") return { cls: "status-http", text: "≡ HTTP" };
  if (server.status === "running") {
    return {
      cls: isShared ? "status-shared" : "status-running",
      text: isShared ? "* SHARED" : "* RUNNING",
    };
  }
  if (server.status === "stopped") {
    return {
      cls: isShared ? "status-shared" : "status-stopped",
      text: isShared ? "~ SHARED" : "o STOPPED",
    };
  }
  if (server.status === "starting") return { cls: "status-starting", text: "… STARTING" };
  if (server.status === "stopping") return { cls: "status-stopping", text: "… STOPPING" };
  return { cls: "status-unknown", text: "? UNKNOWN" };
}

function formatCmd(server) {
  if (server.type === "http" || server.type === "https" || server.type === "sse") {
    if (server.url) {
      try {
        return new URL(server.url).hostname;
      } catch {
        return "HTTP";
      }
    }
    return "HTTP";
  }
  const isNpx =
    server.command === "npx" ||
    server.command === "npx.cmd" ||
    server.command.endsWith("\\npx.cmd") ||
    server.command.endsWith("/npx");
  if (isNpx) {
    const pkg = server.args.find((a) => a.startsWith("@") || a.includes("/"));
    return pkg ? `npx ${pkg}` : `npx ${server.args.slice(0, 2).join(" ")}`;
  }
  return server.command.split(/[\\/]/).pop();
}

function renderTable() {
  const tbody = document.getElementById("servers-tbody");
  const filtered = getFilteredServers();

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">
      <h3>No MCP servers found</h3>
      <p>${searchQuery ? "No servers match your search" : "Check your MCP configuration files"}</p>
    </td></tr>`;
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    let valA = a[sortColumn] || "";
    let valB = b[sortColumn] || "";
    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();
    if (valA < valB) return sortDirection === "asc" ? -1 : 1;
    if (valA > valB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = sorted
    .map((server) => {
      const originalIdx = servers.indexOf(server);
      const isSelected = originalIdx === selectedIndex;
      const { cls: statusClass, text: statusText } = statusDisplay(server);
      const isShared = server.sharedWith && server.sharedWith.length > 0;
      const displayPid = server.pid || server.sharedPid || "-";
      const cmdStr = formatCmd(server);
      const cfgPath = abbreviatePath(server.configPath);

      return `<tr class="${isSelected ? "selected" : ""}" data-index="${originalIdx}">
        <td>${escapeHtml(server.tool)}</td>
        <td>${escapeHtml(server.name)}</td>
        <td class="${statusClass}">${escapeHtml(statusText)}${isShared ? '<span class="shared-badge">(shared)</span>' : ""}</td>
        <td>${displayPid}</td>
        <td>${escapeHtml(cmdStr)}</td>
        <td>${escapeHtml(server.type)}</td>
        <td>${escapeHtml(cfgPath)}</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => {
      selectedIndex = parseInt(row.dataset.index, 10);
      renderTable();
    });
    row.addEventListener("dblclick", () => {
      selectedIndex = parseInt(row.dataset.index, 10);
      showDetails();
    });
  });
}

function updateStats() {
  const running = servers.filter((s) => s.status === "running").length;
  const stopped = servers.filter((s) => s.status === "stopped").length;
  const shared = servers.filter((s) => s.sharedWith && s.sharedWith.length > 0).length;
  const starting = servers.filter((s) => s.status === "starting").length;
  const http = servers.filter((s) => String(s.status).startsWith("http")).length;

  document.getElementById("stat-running").textContent = running;
  document.getElementById("stat-stopped").textContent = stopped;
  document.getElementById("stat-shared").textContent = shared;
  document.getElementById("stat-starting").textContent =
    starting + (http > 0 ? ` + ${http} HTTP` : "");

  const agents = [...new Set(servers.map((s) => s.tool))];
  document.getElementById("stat-agents").textContent = `Agents: ${agents.join(", ") || "none"}`;
}

function updateRefreshTime() {
  const ago = Math.round((Date.now() - lastRefreshTime) / 1000);
  const text = ago < 2 ? "just now" : ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`;
  document.getElementById("stat-refresh").textContent = `Refreshed: ${text}`;
}

function setupEventListeners() {
  document.getElementById("btn-refresh").addEventListener("click", fetchServers);
  document.getElementById("btn-restart").addEventListener("click", restartSelected);
  document.getElementById("btn-kill").addEventListener("click", killSelected);
  document.getElementById("btn-kill-all").addEventListener("click", killAll);
  document.getElementById("btn-restart-all").addEventListener("click", restartAllStopped);
  document.getElementById("btn-details").addEventListener("click", showDetails);
  document.getElementById("btn-logs").addEventListener("click", showLogs);
  document.getElementById("btn-export-logs").addEventListener("click", exportLogs);

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderTable();
    });
  }

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.dataset.sort;
      if (sortColumn === col) sortDirection = sortDirection === "asc" ? "desc" : "asc";
      else {
        sortColumn = col;
        sortDirection = "asc";
      }
      document.querySelectorAll("th").forEach((t) => {
        t.classList.remove("sort-asc", "sort-desc");
        if (t.dataset.sort === sortColumn) {
          t.classList.add(sortDirection === "asc" ? "sort-asc" : "sort-desc");
        }
      });
      renderTable();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (document.querySelector(".modal-overlay.active")) {
      if (e.key === "Escape") closeModals();
      if (e.key === "l" && document.getElementById("details-modal").classList.contains("active"))
        showLogs();
      return;
    }
    if (e.target && e.target.id === "search-input") return;

    switch (e.key.toLowerCase()) {
      case "r":
        restartSelected();
        break;
      case "k":
        if (e.shiftKey) killAll();
        else killSelected();
        break;
      case "a":
        restartAllStopped();
        break;
      case "d":
        showDetails();
        break;
      case "l":
        showLogs();
        break;
      case "arrowup":
        e.preventDefault();
        selectedIndex = Math.max(0, selectedIndex - 1);
        renderTable();
        break;
      case "arrowdown":
        e.preventDefault();
        selectedIndex = Math.min(servers.length - 1, selectedIndex + 1);
        renderTable();
        break;
    }
    if (e.key === "F5") {
      e.preventDefault();
      fetchServers();
    }
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModals();
    });
  });
}

function startAutoRefresh() {
  setInterval(() => {
    fetchServers();
    updateRefreshTime();
  }, appConfig.refreshMs || 5000);
  setInterval(updateRefreshTime, 1000);
}

function isHttpEndpoint(server) {
  return (
    server.type === "http" ||
    server.type === "https" ||
    server.type === "sse" ||
    String(server.status).startsWith("http")
  );
}

async function withActionLock(fn) {
  if (actionInProgress) return;
  actionInProgress = true;
  setActionButtonsDisabled(true);
  try {
    await fn();
  } finally {
    actionInProgress = false;
    setActionButtonsDisabled(false);
  }
}

async function restartSelected() {
  const server = servers[selectedIndex];
  if (!server) return showToast("No server selected", "error");
  if (isHttpEndpoint(server)) return showToast("HTTP/SSE servers cannot be restarted", "warning");

  await withActionLock(async () => {
    log(`Restarting ${server.tool} / ${server.name}...`);
    const response = await fetch(`/api/servers/${encodeURIComponent(server.id)}/restart`, {
      method: "POST",
    });
    const result = await response.json();
    log(result.message, result.success ? "success" : "error");
    showToast(result.message, result.success ? "success" : "error");
    await fetchServers();
  });
}

async function killSelected() {
  const server = servers[selectedIndex];
  if (!server) return showToast("No server selected", "error");
  if (isHttpEndpoint(server)) return showToast("HTTP/SSE servers cannot be killed", "warning");
  if (server.status !== "running") return showToast("Server is not running", "warning");

  await withActionLock(async () => {
    log(`Killing ${server.tool} / ${server.name}...`);
    const response = await fetch(`/api/servers/${encodeURIComponent(server.id)}/kill`, {
      method: "POST",
    });
    const result = await response.json();
    log(result.message, result.success ? "success" : "error");
    showToast(result.message, result.success ? "success" : "error");
    await fetchServers();
  });
}

async function killAll() {
  await withActionLock(async () => {
    log("Killing all running servers...");
    const response = await fetch("/api/servers/kill-all", { method: "POST" });
    const result = await response.json();
    log(result.message, result.success ? "success" : "error");
    showToast(result.message, result.success ? "success" : "error");
    await fetchServers();
  });
}

async function restartAllStopped() {
  await withActionLock(async () => {
    const response = await fetch("/api/servers/restart-all-stopped", { method: "POST" });
    const result = await response.json();
    log(result.message, result.success ? "success" : "error");
    showToast(result.message, result.success ? "success" : "error");
    await fetchServers();
  });
}

async function exportLogs() {
  const server = servers[selectedIndex];
  if (!server) return showToast("No server selected", "error");

  await withActionLock(async () => {
    const response = await fetch(`/api/servers/${encodeURIComponent(server.id)}/export-logs`, {
      method: "POST",
    });
    const result = await response.json();
    log(result.message, result.success ? "success" : "error");
    showToast(result.message, result.success ? "success" : "error");
  });
}

function showDetails() {
  const server = servers[selectedIndex];
  if (!server) return showToast("No server selected", "error");

  const { text: statusText } = statusDisplay(server);
  const displayPid = server.pid || server.sharedPid;

  const searchTermsHtml =
    server.searchTerms && server.searchTerms.length > 0
      ? `<div class="detail-row"><div class="detail-label">Match Terms:</div><div class="detail-value code">${server.searchTerms.map(escapeHtml).join(", ")}</div></div>`
      : "";

  const envLines =
    Object.entries(server.env || {})
      .map(
        ([k, v]) =>
          `<div class="env-var"><span class="env-var-key">${escapeHtml(k)}</span>: ${escapeHtml(v)}</div>`,
      )
      .join("") || '<div style="color: var(--text-muted);">(none)</div>';

  document.getElementById("details-content").innerHTML = `
    <div class="detail-row"><div class="detail-label">Agent:</div><div class="detail-value">${escapeHtml(server.tool)}</div></div>
    <div class="detail-row"><div class="detail-label">Name:</div><div class="detail-value">${escapeHtml(server.name)}</div></div>
    <div class="detail-row"><div class="detail-label">Status:</div><div class="detail-value">${escapeHtml(statusText)}</div></div>
    <div class="detail-row"><div class="detail-label">PID:</div><div class="detail-value">${displayPid || "-"}</div></div>
    <div class="detail-row"><div class="detail-label">Type:</div><div class="detail-value">${escapeHtml(server.type)}</div></div>
    <div class="detail-row"><div class="detail-label">Config Path:</div><div class="detail-value code">${escapeHtml(server.configPath)}</div></div>
    ${server.url ? `<div class="detail-row"><div class="detail-label">URL:</div><div class="detail-value code">${escapeHtml(server.url)}</div></div>` : ""}
    ${server.command ? `<div class="detail-row"><div class="detail-label">Command:</div><div class="detail-value code">${escapeHtml(server.command)} ${(server.args || []).map(escapeHtml).join(" ")}</div></div>` : ""}
    <div class="detail-row"><div class="detail-label">Resources:</div><div class="detail-value">${escapeHtml(server.processInfo || "-")}</div></div>
    ${searchTermsHtml}
    <div class="detail-row"><div class="detail-label">Environment:</div><div class="detail-value"><div class="env-vars">${envLines}</div></div></div>
  `;
  document.getElementById("details-modal").classList.add("active");
}

function showLogs() {
  const server = servers[selectedIndex];
  if (!server) return showToast("No server selected", "error");

  if (isHttpEndpoint(server)) {
    document.getElementById("logs-content").innerHTML =
      '<div style="padding:40px;text-align:center;color:var(--text-muted)">HTTP/SSE servers have no local logs.</div>';
  } else if (!server.logsCapturing && (!server.logs || server.logs.length === 0)) {
    document.getElementById("logs-content").innerHTML =
      '<div style="padding:40px;text-align:center;color:var(--text-muted)">Logs not available. Restart with <strong>r</strong> to capture.</div>';
  } else {
    const lines =
      server.logs && server.logs.length > 0
        ? server.logs
            .map((entry) => {
              const time = new Date(entry.ts).toLocaleTimeString();
              const stream = entry.stream || "stdout";
              let line = entry.line;
              if (line.length > 200) line = `${line.slice(0, 197)}...`;
              return `<div class="log-line"><span class="log-time">${time}</span> [${stream}] ${escapeHtml(line)}</div>`;
            })
            .join("")
        : '<div class="no-logs">No log output yet.</div>';
    document.getElementById("logs-content").innerHTML = lines;
  }
  document.getElementById("logs-modal").classList.add("active");
}

function closeModals() {
  document.querySelectorAll(".modal-overlay").forEach((m) => {
    m.classList.remove("active");
  });
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function abbreviatePath(filePath) {
  if (!filePath) return "";
  const home = (appConfig.home || "").replace(/\\/g, "/");
  let p = filePath.replace(/\\/g, "/");
  if (home && p.startsWith(home)) p = `~${p.slice(home.length)}`;
  if (p.length > 50) p = `...${p.slice(p.length - 47)}`;
  return p;
}

function log(message, type = "info") {
  const logContent = document.getElementById("log-content");
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="timestamp">${time}</span>${escapeHtml(message)}`;
  logContent.appendChild(entry);
  logContent.scrollTop = logContent.scrollHeight;
  while (logContent.children.length > 100) logContent.removeChild(logContent.firstChild);
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

window.closeModals = closeModals;
