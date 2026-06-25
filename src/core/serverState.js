const { loadAllServers } = require("./discovery");

/** Config fields refreshed from disk on reload (runtime fields preserved). */
const CONFIG_FIELDS = [
  "name",
  "command",
  "args",
  "env",
  "type",
  "url",
  "tool",
  "source",
  "configPath",
];

/**
 * @param {object[]} servers
 * @returns {object[]}
 */
function sortServers(servers) {
  return [...servers].sort((a, b) => {
    const toolCmp = a.tool.localeCompare(b.tool);
    if (toolCmp !== 0) return toolCmp;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

/**
 * Find a server by stable id.
 * @param {object[]} servers
 * @param {string} id
 * @returns {object|undefined}
 */
function findServerById(servers, id) {
  return servers.find((s) => s.id === id);
}

/**
 * Re-scan config files and merge newly discovered servers.
 * Preserves runtime state (pid, status, logs) for existing entries.
 * @param {object[]} servers
 * @returns {{ servers: object[], added: number, removed: number, updated: number }}
 */
function reloadServers(servers) {
  const fresh = loadAllServers();
  const existingByKey = new Map();
  for (const s of servers) {
    existingByKey.set(s.id, s);
  }

  let added = 0;
  let updated = 0;
  const freshKeys = new Set();

  for (const f of fresh) {
    freshKeys.add(f.id);
    const existing = existingByKey.get(f.id);
    if (existing) {
      let changed = false;
      for (const key of CONFIG_FIELDS) {
        const nextVal = f[key];
        const prevVal = existing[key];
        const same =
          Array.isArray(nextVal) || typeof nextVal === "object"
            ? JSON.stringify(prevVal) === JSON.stringify(nextVal)
            : prevVal === nextVal;
        if (!same) {
          existing[key] = nextVal;
          changed = true;
        }
      }
      if (changed) updated++;
    } else {
      servers.push(f);
      added++;
    }
  }

  const before = servers.length;
  const next = servers.filter((s) => freshKeys.has(s.id));
  const removed = before - next.length;

  return { servers: next, added, removed, updated };
}

/**
 * Filter servers by tool, status, or free-text query.
 * @param {object[]} servers
 * @param {{ query?: string, tool?: string, status?: string }} filter
 * @returns {object[]}
 */
function filterServers(servers, filter = {}) {
  const q = (filter.query || "").trim().toLowerCase();
  const tool = (filter.tool || "").trim().toLowerCase();
  const status = (filter.status || "").trim().toLowerCase();

  return servers.filter((s) => {
    if (tool && s.tool.toLowerCase() !== tool) return false;
    if (status && s.status.toLowerCase() !== status) return false;
    if (!q) return true;
    const haystack = [
      s.name,
      s.tool,
      s.command,
      s.configPath,
      s.type,
      s.url,
      ...(s.args || []),
      ...(s.searchTerms || []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

module.exports = {
  sortServers,
  findServerById,
  reloadServers,
  filterServers,
};
