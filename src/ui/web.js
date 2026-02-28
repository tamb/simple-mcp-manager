"use strict";

const http = require("http");
const url = require("url");
const path = require("path");
const net = require("net");
const { fileLog } = require("../utils/logger");
const { IS_WIN, IS_MAC, IS_WSL, HOME } = require("../config/constants");
const { loadAllServers } = require("../core/discovery");
const { refreshStatuses, killServer, startServer } = require("../core/processes");

// ── Web UI Mode ─────────────────────────────────────────────────────────────

/**
 * Generate the HTML/CSS/JS for the web UI.
 * This is a self-contained single-page application with no external dependencies.
 */
function generateWebUIHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Server Manager</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --bg-tertiary: #0f3460;
      --text-primary: #e94560;
      --text-secondary: #eaeaea;
      --text-muted: #a0a0a0;
      --border-color: #0f3460;
      --color-running: #4ade80;
      --color-stopped: #f87171;
      --color-shared: #c084fc;
      --color-starting: #22d3ee;
      --color-stopping: #fbbf24;
      --color-http: #60a5fa;
      --color-unknown: #fbbf24;
      --header-bg: #1e3a8a;
      --log-bg: #1e1e2e;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      background: var(--bg-primary);
      color: var(--text-secondary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      background: var(--header-bg);
      padding: 12px 20px;
      border-bottom: 2px solid var(--border-color);
    }

    .header h1 {
      font-size: 1.2rem;
      text-align: center;
      margin-bottom: 8px;
      color: white;
    }

    .header-stats {
      display: flex;
      justify-content: center;
      gap: 20px;
      flex-wrap: wrap;
      font-size: 0.85rem;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .stat-running { color: var(--color-running); }
    .stat-stopped { color: var(--color-stopped); }
    .stat-shared { color: var(--color-shared); }
    .stat-starting { color: var(--color-starting); }
    .stat-stopping { color: var(--color-stopping); }

    /* Toolbar */
    .toolbar {
      display: flex;
      gap: 8px;
      padding: 10px 20px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      flex-wrap: wrap;
    }

    .btn {
      padding: 6px 14px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.85rem;
      transition: all 0.2s;
    }

    .btn:hover:not(:disabled) {
      background: var(--header-bg);
      border-color: var(--text-primary);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: var(--header-bg);
    }

    .btn-danger {
      background: #7f1d1d;
    }

    /* Table Container */
    .table-container {
      flex: 1;
      overflow: auto;
      padding: 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }

    thead {
      background: var(--bg-secondary);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    th {
      padding: 10px 12px;
      text-align: left;
      font-weight: bold;
      color: var(--text-secondary);
      border-bottom: 2px solid var(--border-color);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    th:hover {
      background: var(--bg-tertiary);
    }

    th .sort-indicator {
      margin-left: 4px;
      opacity: 0.5;
    }

    th.sort-asc .sort-indicator::after { content: " ▲"; }
    th.sort-desc .sort-indicator::after { content: " ▼"; }

    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
    }

    tr {
      cursor: pointer;
      transition: background 0.15s;
    }

    tr:hover {
      background: rgba(15, 52, 96, 0.3);
    }

    tr.selected {
      background: var(--header-bg) !important;
    }

    .status-running { color: var(--color-running); font-weight: bold; }
    .status-stopped { color: var(--color-stopped); }
    .status-shared { color: var(--color-shared); }
    .status-starting { color: var(--color-starting); }
    .status-stopping { color: var(--color-stopping); }
    .status-http { color: var(--color-http); font-weight: bold; }
    .status-unknown { color: var(--color-unknown); }

    .shared-badge {
      font-size: 0.75rem;
      margin-left: 6px;
      opacity: 0.8;
    }

    /* Log Panel */
    .log-panel {
      height: 150px;
      background: var(--log-bg);
      border-top: 2px solid var(--border-color);
      display: flex;
      flex-direction: column;
    }

    .log-header {
      padding: 6px 12px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      font-size: 0.8rem;
      font-weight: bold;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .log-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px;
      font-size: 0.8rem;
    }

    .log-entry {
      margin-bottom: 4px;
      line-height: 1.4;
    }

    .log-entry .timestamp {
      color: var(--text-muted);
      margin-right: 8px;
    }

    .log-entry.success { color: var(--color-running); }
    .log-entry.error { color: var(--color-stopped); }
    .log-entry.warning { color: var(--color-stopping); }

    /* Modal */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .modal-overlay.active {
      display: flex;
    }

    .modal {
      background: var(--bg-secondary);
      border: 2px solid var(--border-color);
      border-radius: 8px;
      max-width: 700px;
      width: 100%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      padding: 15px 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h2 {
      font-size: 1.1rem;
      color: var(--text-secondary);
    }

    .modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-close:hover {
      color: var(--text-primary);
    }

    .modal-content {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }

    .detail-row {
      display: flex;
      margin-bottom: 12px;
      font-size: 0.9rem;
    }

    .detail-label {
      width: 140px;
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .detail-value {
      flex: 1;
      word-break: break-all;
    }

    .detail-value.code {
      font-family: monospace;
      background: var(--bg-primary);
      padding: 4px 8px;
      border-radius: 4px;
    }

    .env-vars {
      background: var(--bg-primary);
      padding: 12px;
      border-radius: 4px;
      margin-top: 8px;
    }

    .env-var {
      margin-bottom: 4px;
      font-family: monospace;
      font-size: 0.85rem;
    }

    .env-var-key {
      color: #22d3ee;
    }

    /* Log Viewer Modal */
    .log-viewer {
      max-width: 900px;
    }

    .log-viewer-content {
      background: var(--bg-primary);
      padding: 15px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.85rem;
      max-height: 400px;
      overflow-y: auto;
    }

    .log-line {
      margin-bottom: 3px;
      line-height: 1.3;
    }

    .log-line .log-time {
      color: var(--text-muted);
      margin-right: 8px;
    }

    .log-line .log-type-err {
      color: var(--color-stopped);
    }

    .log-line .log-type-out {
      color: var(--color-running);
    }

    .no-logs {
      color: var(--text-muted);
      font-style: italic;
    }

    /* Keyboard Help */
    .keyboard-help {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .keyboard-help kbd {
      background: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid var(--border-color);
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
    }

    .empty-state h3 {
      margin-bottom: 10px;
      color: var(--text-secondary);
    }

    /* Loading */
    .loading {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
    }

    /* Toast */
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2000;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .toast {
      padding: 12px 16px;
      border-radius: 4px;
      color: white;
      font-size: 0.9rem;
      animation: slideIn 0.3s ease;
      max-width: 300px;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .toast.success { background: #16a34a; }
    .toast.error { background: #dc2626; }
    .toast.info { background: #2563eb; }

    /* Responsive */
    @media (max-width: 768px) {
      .header-stats {
        font-size: 0.75rem;
        gap: 10px;
      }

      th, td {
        padding: 6px 8px;
        font-size: 0.75rem;
      }

      .toolbar {
        padding: 8px;
      }

      .btn {
        padding: 5px 10px;
        font-size: 0.75rem;
      }

      .log-panel {
        height: 120px;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>MCP Server Manager</h1>
    <div class="header-stats">
      <span class="stat stat-running">● <span id="stat-running">0</span> Running</span>
      <span class="stat stat-stopped">● <span id="stat-stopped">0</span> Stopped</span>
      <span class="stat stat-shared">● <span id="stat-shared">0</span> Shared</span>
      <span class="stat stat-starting">● <span id="stat-starting">0</span> Starting</span>
      <span id="stat-agents">Agents: none</span>
      <span id="stat-refresh" style="color: var(--text-muted);">Refreshed: just now</span>
    </div>
  </div>

  <div class="toolbar">
    <button class="btn btn-primary" id="btn-refresh" title="Refresh (F5)">Refresh</button>
    <button class="btn" id="btn-restart" title="Restart selected (r)">Restart</button>
    <button class="btn btn-danger" id="btn-kill" title="Kill selected (k)">Kill</button>
    <button class="btn btn-danger" id="btn-kill-all" title="Kill all running (K)">Kill All</button>
    <button class="btn btn-primary" id="btn-restart-all" title="Restart all stopped (a)">Restart All Stopped</button>
    <button class="btn" id="btn-details" title="View details (d)">Details</button>
    <button class="btn" id="btn-logs" title="View logs (l)">Logs</button>
    <span class="keyboard-help" style="margin-left: auto;">
      <kbd>r</kbd> Restart <kbd>k</kbd> Kill <kbd>K</kbd> Kill All <kbd>a</kbd> Restart All <kbd>d</kbd> Details <kbd>l</kbd> Logs <kbd>F5</kbd> Refresh
    </span>
  </div>

  <div class="table-container">
    <table id="servers-table">
      <thead>
        <tr>
          <th data-sort="tool">Agent <span class="sort-indicator">▲</span></th>
          <th data-sort="name">Server <span class="sort-indicator"></span></th>
          <th data-sort="status">Status <span class="sort-indicator"></span></th>
          <th data-sort="pid">PID <span class="sort-indicator"></span></th>
          <th data-sort="command">Command <span class="sort-indicator"></span></th>
          <th data-sort="type">Type <span class="sort-indicator"></span></th>
          <th data-sort="configPath">Config Path <span class="sort-indicator"></span></th>
        </tr>
      </thead>
      <tbody id="servers-tbody">
        <tr><td colspan="7" class="loading">Loading servers...</td></tr>
      </tbody>
    </table>
  </div>

  <div class="log-panel">
    <div class="log-header">
      <span>Activity Log</span>
      <span style="font-weight: normal; color: var(--text-muted);">Auto-refreshing every ${IS_WSL ? 15 : 5}s</span>
    </div>
    <div class="log-content" id="log-content">
      <div class="log-entry">MCP Server Manager started. Press F5 to refresh manually.</div>
    </div>
  </div>

  <!-- Details Modal -->
  <div class="modal-overlay" id="details-modal">
    <div class="modal">
      <div class="modal-header">
        <h2>Server Details</h2>
        <button class="modal-close" onclick="closeModals()">&times;</button>
      </div>
      <div class="modal-content" id="details-content">
      </div>
    </div>
  </div>

  <!-- Logs Modal -->
  <div class="modal-overlay" id="logs-modal">
    <div class="modal log-viewer">
      <div class="modal-header">
        <h2>Server Logs</h2>
        <button class="modal-close" onclick="closeModals()">&times;</button>
      </div>
      <div class="modal-content">
        <div class="log-viewer-content" id="logs-content">
        </div>
      </div>
    </div>
  </div>

  <div class="toast-container" id="toast-container"></div>

  <script>
    // State
    let servers = [];
    let selectedIndex = -1;
    let sortColumn = 'tool';
    let sortDirection = 'asc';
    let lastRefreshTime = Date.now();
    let isRefreshing = false;
    let refreshInterval;

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      fetchServers();
      setupEventListeners();
      startAutoRefresh();
    });

    // Fetch servers from API
    async function fetchServers() {
      if (isRefreshing) return;
      isRefreshing = true;

      try {
        const response = await fetch('/api/servers');
        if (!response.ok) throw new Error('Failed to fetch servers');
        servers = await response.json();
        renderTable();
        updateStats();
        lastRefreshTime = Date.now();
        updateRefreshTime();
      } catch (error) {
        log('Failed to fetch servers: ' + error.message, 'error');
      } finally {
        isRefreshing = false;
      }
    }

    // Render table
    function renderTable() {
      const tbody = document.getElementById('servers-tbody');

      if (servers.length === 0) {
        tbody.innerHTML = \`<tr><td colspan="7" class="empty-state">
          <h3>No MCP servers found</h3>
          <p>Check your MCP configuration files</p>
        </td></tr>\`;
        return;
      }

      // Sort servers
      const sorted = [...servers].sort((a, b) => {
        let valA = a[sortColumn] || '';
        let valB = b[sortColumn] || '';

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });

      tbody.innerHTML = sorted.map((server, idx) => {
        const originalIdx = servers.indexOf(server);
        const isSelected = originalIdx === selectedIndex;
        const isShared = server.sharedWith && server.sharedWith.length > 0;
        const displayPid = server.pid || server.sharedPid || '-';

        let statusClass = 'status-unknown';
        let statusText = 'UNKNOWN';

        if (server.status === 'http') {
          statusClass = 'status-http';
          statusText = '≡ HTTP';
        } else if (server.status === 'running') {
          statusClass = isShared ? 'status-shared' : 'status-running';
          statusText = isShared ? '* SHARED' : '* RUNNING';
        } else if (server.status === 'stopped') {
          statusClass = isShared ? 'status-shared' : 'status-stopped';
          statusText = isShared ? '~ SHARED' : 'o STOPPED';
        } else if (server.status === 'starting') {
          statusClass = 'status-starting';
          statusText = '… STARTING';
        } else if (server.status === 'stopping') {
          statusClass = 'status-stopping';
          statusText = '… STOPPING';
        }

        let cmdStr = '';
        if (server.type === 'http' || server.type === 'https') {
          // HTTP servers don't have a local command - show the URL hostname or type
          cmdStr = server.url ? new URL(server.url).hostname : 'HTTP';
        } else {
          const isNpx = server.command === 'npx' || server.command === 'npx.cmd' ||
                        server.command.endsWith('\\\\npx.cmd') || server.command.endsWith('/npx');
          if (isNpx) {
            const pkg = server.args.find(a => a.startsWith('@') || a.includes('/'));
            cmdStr = pkg ? \`npx \${pkg}\` : \`npx \${server.args.slice(0, 2).join(' ')}\`;
          } else {
            cmdStr = server.command.split(/[\\\\/]/).pop();
          }
        }

        const cfgPath = abbreviatePath(server.configPath);

        return \`<tr class="\${isSelected ? 'selected' : ''}" data-index="\${originalIdx}">
          <td>\${escapeHtml(server.tool)}</td>
          <td>\${escapeHtml(server.name)}</td>
          <td class="\${statusClass}">\${escapeHtml(statusText)}\${isShared ? \`<span class="shared-badge">(shared)</span>\` : ''}</td>
          <td>\${displayPid}</td>
          <td>\${escapeHtml(cmdStr)}</td>
          <td>\${escapeHtml(server.type)}</td>
          <td>\${escapeHtml(cfgPath)}</td>
        </tr>\`;
      }).join('');

      // Add click handlers
      tbody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', () => {
          selectedIndex = parseInt(row.dataset.index);
          renderTable();
        });

        row.addEventListener('dblclick', () => {
          selectedIndex = parseInt(row.dataset.index);
          showDetails();
        });
      });
    }

    // Update stats
    function updateStats() {
      const running = servers.filter(s => s.status === 'running').length;
      const stopped = servers.filter(s => s.status === 'stopped').length;
      const shared = servers.filter(s => s.sharedWith && s.sharedWith.length > 0).length;
      const starting = servers.filter(s => s.status === 'starting').length;
      const http = servers.filter(s => s.status === 'http').length;

      document.getElementById('stat-running').textContent = running;
      document.getElementById('stat-stopped').textContent = stopped;
      document.getElementById('stat-shared').textContent = shared;
      document.getElementById('stat-starting').textContent = starting + (http > 0 ? ' + ' + http + ' HTTP' : '');

      const agents = [...new Set(servers.map(s => s.tool))];
      document.getElementById('stat-agents').textContent = 'Agents: ' + (agents.join(', ') || 'none');
    }

    // Update refresh time display
    function updateRefreshTime() {
      const ago = Math.round((Date.now() - lastRefreshTime) / 1000);
      const text = ago < 2 ? 'just now' : ago < 60 ? ago + 's ago' : Math.floor(ago / 60) + 'm ago';
      document.getElementById('stat-refresh').textContent = 'Refreshed: ' + text;
    }

    // Setup event listeners
    function setupEventListeners() {
      // Button handlers
      document.getElementById('btn-refresh').addEventListener('click', fetchServers);
      document.getElementById('btn-restart').addEventListener('click', restartSelected);
      document.getElementById('btn-kill').addEventListener('click', killSelected);
      document.getElementById('btn-kill-all').addEventListener('click', killAll);
      document.getElementById('btn-restart-all').addEventListener('click', restartAllStopped);
      document.getElementById('btn-details').addEventListener('click', showDetails);
      document.getElementById('btn-logs').addEventListener('click', showLogs);

      // Sort handlers
      document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
          const col = th.dataset.sort;
          if (sortColumn === col) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            sortColumn = col;
            sortDirection = 'asc';
          }

          // Update sort indicators
          document.querySelectorAll('th').forEach(t => {
            t.classList.remove('sort-asc', 'sort-desc');
            if (t.dataset.sort === sortColumn) {
              t.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
            }
          });

          renderTable();
        });
      });

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (document.querySelector('.modal-overlay.active')) {
          if (e.key === 'Escape') closeModals();
          if (e.key === 'l' && document.getElementById('details-modal').classList.contains('active')) {
            showLogs();
          }
          return;
        }

        switch (e.key.toLowerCase()) {
          case 'r': restartSelected(); break;
          case 'k':
            if (e.shiftKey) killAll();
            else killSelected();
            break;
          case 'a': restartAllStopped(); break;
          case 'd': showDetails(); break;
          case 'l': showLogs(); break;
          case 'arrowup':
            e.preventDefault();
            selectedIndex = Math.max(0, selectedIndex - 1);
            renderTable();
            break;
          case 'arrowdown':
            e.preventDefault();
            selectedIndex = Math.min(servers.length - 1, selectedIndex + 1);
            renderTable();
            break;
        }

        if (e.key === 'F5') {
          e.preventDefault();
          fetchServers();
        }
      });

      // Close modals on overlay click
      document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeModals();
        });
      });
    }

    // Start auto-refresh
    function startAutoRefresh() {
      const interval = ${IS_WSL ? 15000 : 5000};
      refreshInterval = setInterval(() => {
        fetchServers();
        updateRefreshTime();
      }, interval);

      // Update "X ago" display every second
      setInterval(updateRefreshTime, 1000);
    }

    // Actions
    async function restartSelected() {
      const server = servers[selectedIndex];
      if (!server) {
        showToast('No server selected', 'error');
        return;
      }

      if (server.status === 'http') {
        showToast('HTTP servers cannot be restarted - they are external endpoints', 'warning');
        return;
      }

      log(\`Restarting \${server.tool} / \${server.name}...\`);
      try {
        const response = await fetch(\`/api/servers/\${encodeURIComponent(server.name)}/restart\`, {
          method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
          log(result.message, 'success');
          showToast(result.message, 'success');
        } else {
          log(result.message, 'error');
          showToast(result.message, 'error');
        }

        setTimeout(fetchServers, 1500);
      } catch (error) {
        log('Failed to restart: ' + error.message, 'error');
        showToast('Failed to restart', 'error');
      }
    }

    async function killSelected() {
      const server = servers[selectedIndex];
      if (!server) {
        showToast('No server selected', 'error');
        return;
      }

      if (server.status === 'http') {
        showToast('HTTP servers cannot be killed - they are external endpoints', 'warning');
        return;
      }

      if (server.status !== 'running') {
        showToast('Server is not running', 'warning');
        return;
      }

      log(\`Killing \${server.tool} / \${server.name}...\`);
      try {
        const response = await fetch(\`/api/servers/\${encodeURIComponent(server.name)}/kill\`, {
          method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
          log(result.message, 'success');
          showToast(result.message, 'success');
        } else {
          log(result.message, 'error');
          showToast(result.message, 'error');
        }

        fetchServers();
        setTimeout(fetchServers, 3000);
      } catch (error) {
        log('Failed to kill: ' + error.message, 'error');
        showToast('Failed to kill', 'error');
      }
    }

    async function killAll() {
      const running = servers.filter(s => s.status === 'running');
      if (running.length === 0) {
        showToast('No running servers', 'warning');
        return;
      }

      log(\`Killing all \${running.length} running server(s)...\`);
      try {
        const response = await fetch('/api/servers/kill-all', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
          log(result.message, 'success');
          showToast(result.message, 'success');
        } else {
          log(result.message, 'error');
          showToast(result.message, 'error');
        }

        setTimeout(fetchServers, 3000);
      } catch (error) {
        log('Failed to kill all: ' + error.message, 'error');
        showToast('Failed to kill all', 'error');
      }
    }

    async function restartAllStopped() {
      const stopped = servers.filter(s => s.status === 'stopped');
      if (stopped.length === 0) {
        showToast('No stopped servers', 'warning');
        return;
      }

      log(\`Restarting \${stopped.length} stopped server(s)...\`);
      try {
        const response = await fetch('/api/servers/restart-all-stopped', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
          log(result.message, 'success');
          showToast(result.message, 'success');
        } else {
          log(result.message, 'error');
          showToast(result.message, 'error');
        }

        setTimeout(fetchServers, 1500);
      } catch (error) {
        log('Failed to restart all: ' + error.message, 'error');
        showToast('Failed to restart all', 'error');
      }
    }

    // Show details modal
    function showDetails() {
      const server = servers[selectedIndex];
      if (!server) {
        showToast('No server selected', 'error');
        return;
      }

      const isShared = server.sharedWith && server.sharedWith.length > 0;
      let statusHtml = '';

      if (server.status === 'http') {
        statusHtml = \`<span class="status-http">≡ HTTP</span> - External HTTP endpoint\${server.url ? ' at ' + server.url : ''}\`;
      } else if (server.status === 'running') {
        statusHtml = isShared
          ? \`<span class="status-shared">* SHARED</span> (shared with \${server.sharedWith.join(', ')})\`
          : '<span class="status-running">* RUNNING</span>';
      } else if (server.status === 'stopped') {
        statusHtml = isShared
          ? \`<span class="status-shared">~ SHARED</span> (process owned by \${server.sharedWith.join(', ')})\`
          : '<span class="status-stopped">o STOPPED</span>';
      } else if (server.status === 'starting') {
        statusHtml = '<span class="status-starting">… STARTING</span>';
      } else if (server.status === 'stopping') {
        statusHtml = '<span class="status-stopping">… STOPPING</span>';
      }

      const displayPid = server.pid || server.sharedPid;

      let logsHtml = '';
      if (server.logsCapturing && server.logs && server.logs.length > 0) {
        logsHtml = '<span class="status-running">Logs available</span> - Press l to view';
      } else if (server.logsCapturing) {
        logsHtml = '<span class="status-starting">No log output yet</span>';
      } else {
        logsHtml = '<span style="color: var(--text-muted);">Logs not available</span> - Server started by ' + server.tool;
      }

      const envLines = Object.entries(server.env).map(([k, v]) => {
        const sensitive = /token|key|password|secret|api/i;
        const display = sensitive.test(k) ? v.slice(0, 6) + '******' + v.slice(-4) : v;
        return \`<div class="env-var"><span class="env-var-key">\${escapeHtml(k)}</span>: \${escapeHtml(display)}</div>\`;
      }).join('') || '<div style="color: var(--text-muted);">(none)</div>';

      const sharedSection = isShared ? \`
        <div class="detail-row">
          <div class="detail-label">Shared With:</div>
          <div class="detail-value">\${server.sharedWith.map(s => \`<div class="status-shared">\${escapeHtml(s)}</div>\`).join('')}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label"></div>
          <div class="detail-value" style="color: var(--text-muted); font-size: 0.85rem;">This server shares a process with the above. Killing it will affect all linked servers.</div>
        </div>
      \` : '';

      document.getElementById('details-content').innerHTML = \`
        <div class="detail-row">
          <div class="detail-label">Agent:</div>
          <div class="detail-value">\${escapeHtml(server.tool)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Name:</div>
          <div class="detail-value">\${escapeHtml(server.name)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Status:</div>
          <div class="detail-value">\${statusHtml}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">PID:</div>
          <div class="detail-value">\${displayPid || '-'}\</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Type:</div>
          <div class="detail-value">\${escapeHtml(server.type)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Source:</div>
          <div class="detail-value">\${escapeHtml(server.source)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Config Path:</div>
          <div class="detail-value code">\${escapeHtml(server.configPath)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Full Path:</div>
          <div class="detail-value code">\${escapeHtml(server.configPath ? new URL('file://' + server.configPath).pathname : '-')}</div>
        </div>
        \${server.type === 'http' || server.type === 'https' ?
          \`<div class="detail-row">
            <div class="detail-label">URL:</div>
            <div class="detail-value code">\${escapeHtml(server.url || '-')}</div>
          </div>\` :
          \`<div class="detail-row">
            <div class="detail-label">Command:</div>
            <div class="detail-value code">\${escapeHtml(server.command)} \${server.args.map(a => escapeHtml(a)).join(' ')}</div>
          </div>\`
        }
        <div class="detail-row">
          <div class="detail-label">Resources:</div>
          <div class="detail-value">\${escapeHtml(server.processInfo || '-')}</div>
        </div>
        \${sharedSection}
        <div class="detail-row">
          <div class="detail-label">Logs:</div>
          <div class="detail-value">\${logsHtml}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Environment:</div>
          <div class="detail-value">
            <div class="env-vars">\${envLines}</div>
          </div>
        </div>
        <div style="margin-top: 20px; color: var(--text-muted); font-size: 0.85rem;">
          Press <kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 3px;">Esc</kbd> or <kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 3px;">Enter</kbd> to close, <kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 3px;">l</kbd> to view logs
        </div>
      \`;

      document.getElementById('details-modal').classList.add('active');
    }

    // Show logs modal
    async function showLogs() {
      const server = servers[selectedIndex];
      if (!server) {
        showToast('No server selected', 'error');
        return;
      }

      // HTTP servers don't have logs - they're external endpoints
      if (server.status === 'http') {
        document.getElementById('logs-content').innerHTML = \`
          <div style="text-align: center; padding: 40px;">
            <div style="color: var(--color-http); font-size: 1.1rem; margin-bottom: 15px;">HTTP Server</div>
            <div style="color: var(--text-muted); margin-bottom: 15px;">This is an external HTTP endpoint managed by <strong>\${escapeHtml(server.tool)}</strong>.</div>
            <div style="color: var(--text-secondary);">HTTP servers don't have local logs. URL: \${escapeHtml(server.url || 'N/A')}</div>
          </div>
        \`;
        document.getElementById('logs-modal').classList.add('active');
        return;
      }

      if (!server.logsCapturing && (!server.logs || server.logs.length === 0)) {
        document.getElementById('logs-content').innerHTML = \`
          <div style="text-align: center; padding: 40px;">
            <div style="color: var(--color-stopping); font-size: 1.1rem; margin-bottom: 15px;">Logs Not Available</div>
            <div style="color: var(--text-muted); margin-bottom: 15px;">This server was started by <strong>\${escapeHtml(server.tool)}</strong> before this manager opened.</div>
            <div style="color: var(--text-secondary);">To enable log capture, restart this server using the <strong>r</strong> key.</div>
          </div>
        \`;
      } else {
        const displayPid = server.pid || server.sharedPid;
        const logLines = server.logs && server.logs.length > 0
          ? server.logs.map(entry => {
              const time = new Date(entry.ts).toLocaleTimeString();
              const typeClass = entry.type === 'err' ? 'log-type-err' : 'log-type-out';
              const typeLabel = entry.type === 'err' ? 'err' : 'out';
              let line = entry.line;
              if (line.length > 200) line = line.slice(0, 197) + '...';
              return \`<div class="log-line"><span class="log-time">\${time}</span> [<span class="\${typeClass}">\${typeLabel}</span>] \${escapeHtml(line)}</div>\`;
            }).join('')
          : '<div class="no-logs">No log output yet. Logs will appear here as the server produces output.</div>';

        document.getElementById('logs-content').innerHTML = \`
          <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color);">
            <strong>Server:</strong> \${escapeHtml(server.tool)} / \${escapeHtml(server.name)}
            <strong style="margin-left: 20px;">PID:</strong> \${displayPid || '-'}
            <strong style="margin-left: 20px;">Status:</strong> \${escapeHtml(server.status)}
          </div>
          <div style="color: var(--text-muted); margin-bottom: 10px; font-size: 0.8rem;">Press Escape or Enter to close</div>
          \${logLines}
        \`;
      }

      document.getElementById('logs-modal').classList.add('active');
    }

    // Close modals
    function closeModals() {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }

    // Utility functions
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function abbreviatePath(filePath) {
      if (!filePath) return '';
      const home = '${HOME}'.replace(/\\\\/g, '/');
      let p = filePath.replace(/\\\\/g, '/');
      if (p.startsWith(home)) {
        p = '~' + p.slice(home.length);
      }
      if (p.length > 50) {
        p = '...' + p.slice(p.length - 47);
      }
      return p;
    }

    function log(message, type = 'info') {
      const logContent = document.getElementById('log-content');
      const time = new Date().toLocaleTimeString('en-US', { hour12: false });
      const entry = document.createElement('div');
      entry.className = \`log-entry \${type}\`;
      entry.innerHTML = \`<span class="timestamp">\${time}</span>\${escapeHtml(message)}\`;
      logContent.appendChild(entry);
      logContent.scrollTop = logContent.scrollHeight;

      // Keep only last 100 entries
      while (logContent.children.length > 100) {
        logContent.removeChild(logContent.firstChild);
      }
    }

    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = \`toast \${type}\`;
      toast.textContent = message;
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  </script>
</body>
</html>`;
}

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

/**
 * Create and start the web UI HTTP server.
 */
async function createWebApp() {
  fileLog("INFO", "Starting Web UI mode");

  // Load servers and refresh statuses (shared state for web mode)
  let servers = loadAllServers();
  refreshStatuses(servers);
  let lastRefreshTime = new Date();

  /**
   * Re-scan config files and merge newly discovered servers.
   */
  function reloadServersWeb() {
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

    const before = servers.length;
    servers = servers.filter((s) => {
      const key = `${path.resolve(s.configPath)}::${s.name}`;
      return freshKeys.has(key);
    });
    removed = before - servers.length;

    return { added, removed };
  }

  // Start periodic refresh
  const REFRESH_MS = IS_WSL ? 15000 : 5000;
  setInterval(() => {
    const { added, removed } = reloadServersWeb();
    refreshStatuses(servers);
    lastRefreshTime = new Date();
    if (added > 0) fileLog("INFO", `Web UI: Auto-detected +${added} new server(s)`);
    if (removed > 0) fileLog("INFO", `Web UI: Auto-detected -${removed} removed server(s)`);
  }, REFRESH_MS);

  // Create HTTP server
  const port = await findAvailablePort(parseInt(process.env.PORT, 10) || 3000);

  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Route handlers
    try {
      // Main page
      if (pathname === "/" && method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(generateWebUIHTML());
        return;
      }

      // Health check
      if (pathname === "/health" && method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", servers: servers.length }));
        return;
      }

      // API: List all servers
      if (pathname === "/api/servers" && method === "GET") {
        // Refresh before returning
        refreshStatuses(servers);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(servers, null, 2));
        return;
      }

      // API: Restart a server
      const restartMatch = pathname.match(/^\/api\/servers\/(.+)\/restart$/);
      if (restartMatch && method === "POST") {
        const serverName = decodeURIComponent(restartMatch[1]);
        const server = servers.find((s) => s.name === serverName);

        if (!server) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, message: "Server not found" }));
          return;
        }

        fileLog("INFO", `Web UI: Restarting ${server.tool}/${server.name}`);

        const wasRunning = server.status === "running";
        if (wasRunning) {
          server.status = "stopping";
          const killResult = killServer(server);
          fileLog("INFO", `Web UI kill result: ${killResult.message}`);
        }

        server.status = "starting";

        setTimeout(() => {
          const startResult = startServer(server);
          fileLog("INFO", `Web UI start result: ${startResult.message}`);

          setTimeout(() => {
            refreshStatuses(servers);
            lastRefreshTime = new Date();
          }, 1500);
        }, wasRunning ? 1000 : 100);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: `Restarting ${server.tool}/${server.name}`
        }));
        return;
      }

      // API: Kill a server
      const killMatch = pathname.match(/^\/api\/servers\/(.+)\/kill$/);
      if (killMatch && method === "POST") {
        const serverName = decodeURIComponent(killMatch[1]);
        const server = servers.find((s) => s.name === serverName);

        if (!server) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, message: "Server not found" }));
          return;
        }

        if (server.status !== "running") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, message: "Server is not running" }));
          return;
        }

        fileLog("INFO", `Web UI: Killing ${server.tool}/${server.name}`);
        server.status = "stopping";

        const result = killServer(server);

        setTimeout(() => {
          refreshStatuses(servers);
          lastRefreshTime = new Date();
        }, 3000);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // API: Kill all running servers
      if (pathname === "/api/servers/kill-all" && method === "POST") {
        const running = servers.filter((s) => s.status === "running");

        if (running.length === 0) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, message: "No running servers" }));
          return;
        }

        fileLog("INFO", `Web UI: Killing all ${running.length} running servers`);

        for (const server of running) {
          server.status = "stopping";
        }

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
          if (result.success) killed++;
          else failed++;

          for (const pid of pids) killedPids.add(pid);
        }

        setTimeout(() => {
          refreshStatuses(servers);
          lastRefreshTime = new Date();
        }, 3000);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: `Killed ${killed} server(s)${failed > 0 ? `, ${failed} failed` : ''}`
        }));
        return;
      }

      // API: Restart all stopped servers
      if (pathname === "/api/servers/restart-all-stopped" && method === "POST") {
        const stopped = servers.filter((s) => s.status === "stopped");

        if (stopped.length === 0) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, message: "No stopped servers" }));
          return;
        }

        fileLog("INFO", `Web UI: Restarting all ${stopped.length} stopped servers`);

        let idx = 0;
        function restartNext() {
          if (idx >= stopped.length) {
            setTimeout(() => {
              refreshStatuses(servers);
              lastRefreshTime = new Date();
            }, 1500);
            return;
          }

          const server = stopped[idx++];
          server.status = "starting";
          const result = startServer(server);
          fileLog("INFO", `Web UI restart result for ${server.name}: ${result.message}`);

          setTimeout(restartNext, 500);
        }

        restartNext();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: `Restarting ${stopped.length} stopped server(s)`
        }));
        return;
      }

      // API: Get server details (same as list but for specific server)
      const detailsMatch = pathname.match(/^\/api\/servers\/(.+)\/details$/);
      if (detailsMatch && method === "GET") {
        const serverName = decodeURIComponent(detailsMatch[1]);
        const server = servers.find((s) => s.name === serverName);

        if (!server) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, message: "Server not found" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(server, null, 2));
        return;
      }

      // 404 for everything else
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");

    } catch (error) {
      fileLog("ERROR", `Web UI request error: ${pathname}`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: error.message }));
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
    console.log("   Keyboard shortcuts (when focused on page):");
    console.log("     r  - Restart selected server");
    console.log("     k  - Kill selected server");
    console.log("     K  - Kill all running servers");
    console.log("     a  - Restart all stopped servers");
    console.log("     d  - Show server details");
    console.log("     l  - Show server logs");
    console.log("     F5 - Refresh server list");
    console.log("");
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\nShutting down Web UI server...");
    fileLog("INFO", "Web UI shutting down (SIGINT)");
    server.close(() => {
      process.exit(0);
    });
  });

  process.on("SIGTERM", () => {
    fileLog("INFO", "Web UI shutting down (SIGTERM)");
    server.close(() => {
      process.exit(0);
    });
  });
}

module.exports = {
  generateWebUIHTML,
  findAvailablePort,
  createWebApp,
};
