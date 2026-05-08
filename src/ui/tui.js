"use strict";

const path = require("path");
const blessed = require("blessed");
const { fileLog, stripTags } = require("../utils/logger");
const { abbreviatePath } = require("../utils/path");
const { IS_WIN, IS_MAC, IS_WSL } = require("../config/constants");
const { loadAllServers } = require("../core/discovery");
const { refreshStatuses, killServer, startServer } = require("../core/processes");

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
    const starting = servers.filter((s) => s.status === "starting").length;
    const stopping = servers.filter((s) => s.status === "stopping").length;
    const shared = servers.filter((s) => s.sharedWith && s.sharedWith.length > 0).length;
    const total = servers.length;
    const agents = [...new Set(servers.map((s) => s.tool))];
    const refreshAgo = Math.round((Date.now() - lastRefreshTime.getTime()) / 1000);
    const refreshStr = refreshAgo < 2 ? "just now" : `${refreshAgo}s ago`;
    const sharedStr = shared > 0 ? `  {magenta-fg}~ ${shared} Shared{/}` : "";
    const startingStr = starting > 0 ? `  {cyan-fg}… ${starting} Starting{/}` : "";
    const stoppingStr = stopping > 0 ? `  {yellow-fg}… ${stopping} Stopping{/}` : "";
    header.setContent(
      `{center}{bold}  MCP Server Manager{/bold}{/center}\n` +
        `{center}{green-fg}* ${running} Running{/}  {red-fg}o ${stopped} Stopped{/}${startingStr}${stoppingStr}${sharedStr}  ` +
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
    if (server.status === "http") {
      statusTag = "{blue-fg}≡ HTTP{/}".padEnd(COL.status + 14);
    } else if (server.status === "running" && isShared) {
      statusTag = "{green-fg}* SHARED{/} ".padEnd(COL.status + 17);
    } else if (server.status === "running") {
      statusTag = "{green-fg}* RUNNING{/}".padEnd(COL.status + 18);
    } else if (server.status === "starting") {
      statusTag = "{cyan-fg}… STARTING{/}".padEnd(COL.status + 18);
    } else if (server.status === "stopping") {
      statusTag = "{yellow-fg}… STOPPING{/}".padEnd(COL.status + 18);
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

    let cmdStr;
    if (server.type === "http" || server.type === "https") {
      // HTTP servers don't have a local command - show the URL or type
      cmdStr = server.url ? new URL(server.url).hostname : "HTTP";
    } else {
      const isNpx =
        server.command === "npx" ||
        server.command === "npx.cmd" ||
        server.command.endsWith("\\npx.cmd") ||
        server.command.endsWith("/npx");

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
      " {bold}r{/} Restart  {bold}k{/} Kill  {bold}K{/} Kill All  {bold}a{/} Restart All Stopped  {bold}F5{/} Refresh  {bold}d{/} Details  {bold}l{/} Logs  {bold}q{/} Quit",
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
    if (server.status === "http") {
      statusStr = `{blue-fg}≡ HTTP{/} {gray-fg}(external endpoint${server.url ? " at " + server.url : ""}){/}`;
    } else if (server.status === "running" && isShared) {
      statusStr = "{green-fg}* SHARED{/} {gray-fg}(process shared with " + server.sharedWith.join(", ") + "){/}";
    } else if (server.status === "running") {
      statusStr = "{green-fg}* RUNNING{/}";
    } else if (server.status === "starting") {
      statusStr = "{cyan-fg}… STARTING{/}";
    } else if (server.status === "stopping") {
      statusStr = "{yellow-fg}… STOPPING{/}";
    } else if (server.status === "stopped" && isShared) {
      statusStr = "{magenta-fg}~ SHARED{/} {gray-fg}(process owned by " + server.sharedWith.join(", ") + "){/}";
    } else {
      statusStr = "{red-fg}o STOPPED{/}";
    }

    const displayPid = server.pid || server.sharedPid;

    // Determine logs status message
    let logsStr;
    if (server.status === "http") {
      logsStr = `{gray-fg}Logs not available{/} - HTTP servers are external endpoints without local process logs.`;
    } else if (server.logsCapturing && server.logs && server.logs.length > 0) {
      logsStr = `{green-fg}Logs available{/} - Press {bold}l{/} to view (${server.logs.length} lines captured)`;
    } else if (server.logsCapturing) {
      logsStr = `{yellow-fg}No log output yet{/} - Press {bold}l{/} to view (will show as output arrives)`;
    } else {
      logsStr = `{gray-fg}Logs not available{/} - Server started by {bold}${server.tool}{/}. Press {bold}r{/} to restart and enable log capture.`;
    }

    const content = [
      `  {bold}Agent:{/}       ${server.tool}`,
      `  {bold}Name:{/}        ${server.name}`,
      `  {bold}Status:{/}      ${statusStr}`,
      `  {bold}PID:{/}         ${displayPid || "-"}`,
      `  {bold}Type:{/}        ${server.type}`,
      `  {bold}Source:{/}      ${server.source}`,
      `  {bold}Config Path:{/} ${abbreviatePath(server.configPath)}`,
      `  {bold}Full Path:{/}   ${path.resolve(server.configPath)}`,
      ...(server.type === "http" || server.type === "https" ? [
        `  {bold}URL:{/}          ${server.url || "-"}`,
      ] : [
        `  {bold}Command:{/}     ${server.command} ${server.args.join(" ")}`,
      ]),
      `  {bold}Resources:{/}   ${server.processInfo || "-"}`,
      ...(isShared ? [
        ``,
        `  {bold}Shared With:{/}`,
        ...server.sharedWith.map((s) => `    {magenta-fg}${s}{/}`),
        `  {gray-fg}This server shares a process with the above.{/}`,
        `  {gray-fg}Killing it will affect all linked servers.{/}`,
      ] : []),
      ``,
      `  {bold}Logs:{/}         ${logsStr}`,
      ``,
      `  {bold}Environment:{/}`,
      envLines || "    (none)",
      ``,
      `  {gray-fg}Press Escape or Enter to close, l to view logs{/}`,
    ].join("\n");

    detailPopup.setContent(content);
    detailPopup.show();
    detailPopup.focus();
    screen.render();
  }

  // ── Log Popup ───────────────────────────────────────────────────────────

  const logPopup = blessed.box({
    top: "center",
    left: "center",
    width: "90%",
    height: "80%",
    border: { type: "line" },
    label: " Server Logs ",
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

  function showLogs(server) {
    // HTTP servers don't have local process logs
    if (server.status === "http") {
      const content = [
        ``,
        `  {blue-fg}HTTP Server{/}`,
        ``,
        `  This is an external HTTP endpoint managed by {bold}${server.tool}{/}.`,
        ``,
        `  URL: ${server.url || "N/A"}`,
        ``,
        `  {gray-fg}HTTP servers don't have local process logs.{/}`,
        ``,
        `  {gray-fg}Press Escape or Enter to close{/}`,
      ].join("\n");
      logPopup.setContent(content);
      logPopup.show();
      logPopup.focus();
      logPopup.scrollTo(logPopup.getScrollHeight());
      screen.render();
      return;
    }

    if (!server.logsCapturing && (!server.logs || server.logs.length === 0)) {
      // Show message when logs aren't available
      const content = [
        ``,
        `  {yellow-fg}Logs Not Available{/}`,
        ``,
        `  This server was started by {bold}${server.tool}{/} before this manager opened.`,
        ``,
        `  To enable log capture:`,
        ``,
        `  1. Close this popup ({bold}Esc{/} or {bold}Enter{/})`,
        `  2. Select this server and press {bold}r{/} to restart it`,
        `  3. After restart, logs will be captured and viewable here`,
        ``,
        `  {gray-fg}Note: Only servers started by this tool can have their logs captured.{/}`,
        ``,
        `  {gray-fg}Press Escape or Enter to close{/}`,
      ].join("\n");
      logPopup.setContent(content);
    } else {
      // Show actual logs
      const displayPid = server.pid || server.sharedPid;
      const logLines = server.logs && server.logs.length > 0
        ? server.logs.map((entry) => {
            const ts = new Date(entry.ts).toLocaleTimeString("en-US", { hour12: false });
            const stream =
              entry.stream ||
              (entry.type === "err" ? "stderr" : "stdout");
            const typeColor = stream === "stderr" ? "cyan-fg" : "green-fg";
            const typeLabel = stream === "stderr" ? "stderr" : "stdout";
            // Truncate very long lines
            let line = entry.line;
            if (line.length > 200) {
              line = line.slice(0, 197) + "...";
            }
            return `  {gray-fg}${ts}{/} [{${typeColor}}${typeLabel}{/}] ${line}`;
          })
        : [`  {gray-fg}No log output yet. Logs will appear here as the server produces output.{/}`];

      const content = [
        `  {bold}Server:{/} ${server.tool} / ${server.name}  {bold}PID:{/} ${displayPid || "-"}  {bold}Status:{/} ${server.status}`,
        ``,
        `  {gray-fg}Press Escape or Enter to close{/}`,
        ``,
        ...logLines,
      ].join("\n");
      logPopup.setContent(content);
    }

    logPopup.show();
    logPopup.focus();
    // Scroll to bottom to show latest logs
    logPopup.scrollTo(logPopup.getScrollHeight());
    screen.render();
  }

  // ── Assemble Screen ─────────────────────────────────────────────────────

  screen.append(header);
  screen.append(tableBox);
  screen.append(logBox);
  screen.append(footer);
  screen.append(detailPopup);
  screen.append(logPopup);

  // ── Key Bindings ────────────────────────────────────────────────────────

  tableList.on("select item", (item, index) => {
    selectedRow = index;
  });

  detailPopup.key(["escape", "enter", "q"], () => {
    detailPopup.hide();
    tableList.focus();
    screen.render();
  });

  detailPopup.key(["l"], () => {
    const server = servers[selectedRow];
    if (!server) return;
    detailPopup.hide();
    showLogs(server);
  });

  logPopup.key(["escape", "enter", "q"], () => {
    logPopup.hide();
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

    if (server.status === "http") {
      log(`{yellow-fg}Cannot restart HTTP server ${server.name} - it is an external endpoint{/}`);
      return;
    }

    log(`Restarting {bold}${server.tool} / ${server.name}{/}...`);

    const wasRunning = server.status === "running";
    if (wasRunning) {
      server.status = "stopping";
      updateTable();
      updateHeader();
      screen.render();
      const killResult = killServer(server);
      log(`  ${killResult.message}`);
    }

    server.status = "starting";
    updateTable();
    updateHeader();
    screen.render();

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
    }, wasRunning ? 1000 : 100);
  });

  screen.key(["k"], () => {
    if (detailPopup.visible) return;
    const server = servers[selectedRow];
    if (!server) return;

    if (server.status === "http") {
      log(`{yellow-fg}Cannot kill HTTP server ${server.name} - it is an external endpoint{/}`);
      return;
    }

    if (server.status !== "running") {
      log(`{yellow-fg}${server.tool} / ${server.name} is not running.{/}`);
      return;
    }

    server.status = "stopping";
    updateTable();
    updateHeader();
    screen.render();

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

  screen.key(["S-k", "K"], () => {
    if (detailPopup.visible) return;
    const running = servers.filter((s) => s.status === "running");
    if (running.length === 0) {
      log("{yellow-fg}No running servers to kill.{/}");
      return;
    }

    log(`Killing all ${running.length} running server(s)...`);
    for (const server of running) {
      server.status = "stopping";
    }
    updateTable();
    updateHeader();
    screen.render();

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
      server.status = "starting";
      updateTable();
      updateHeader();
      screen.render();
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

  screen.key(["l"], () => {
    if (logPopup.visible) {
      logPopup.hide();
      detailPopup.hide();
      tableList.focus();
      screen.render();
      return;
    }
    const server = servers[selectedRow];
    if (server) showLogs(server);
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
    "Keys: {bold}r{/} restart, {bold}k{/} kill, {bold}K{/} kill all, {bold}a{/} restart all stopped, {bold}F5{/} refresh, {bold}d{/} details, {bold}l{/} logs, {bold}q{/} quit."
  );
  screen.render();
}

module.exports = {
  createApp,
};
