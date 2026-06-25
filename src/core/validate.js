const fs = require("node:fs");
const path = require("node:path");
const { findMcpConfigs, parseMcpConfig } = require("./discovery");

/**
 * Validate all discovered MCP config files.
 * @returns {{ valid: boolean, issues: Array<{ severity: string, message: string, configPath?: string }> }}
 */
function validateAllConfigs() {
  const issues = [];
  const configs = findMcpConfigs();
  const seenIds = new Map();

  if (configs.length === 0) {
    issues.push({
      severity: "warn",
      message: "No MCP config files found on this system",
    });
  }

  for (const cfg of configs) {
    const resolved = path.resolve(cfg.path);

    if (!fs.existsSync(cfg.path)) {
      issues.push({
        severity: "error",
        message: "Config file listed but missing on disk",
        configPath: resolved,
      });
      continue;
    }

    try {
      JSON.parse(fs.readFileSync(cfg.path, "utf-8"));
    } catch (e) {
      issues.push({
        severity: "error",
        message: `Invalid JSON: ${e.message}`,
        configPath: resolved,
      });
      continue;
    }

    const servers = parseMcpConfig(cfg.path, cfg.configKey, cfg.tool, cfg.source);
    for (const server of servers) {
      const isRemote =
        server.type === "http" || server.type === "https" || server.type === "sse" || !!server.url;

      if (isRemote) {
        if (!server.url) {
          issues.push({
            severity: "error",
            message: `[${server.tool}] Server "${server.name}" is remote but missing url`,
            configPath: resolved,
          });
        }
      } else if (!server.command) {
        issues.push({
          severity: "error",
          message: `[${server.tool}] Server "${server.name}" is missing a command`,
          configPath: resolved,
        });
      }

      if (seenIds.has(server.id)) {
        issues.push({
          severity: "warn",
          message: `Duplicate server id "${server.id}" (also in ${seenIds.get(server.id)})`,
          configPath: resolved,
        });
      } else {
        seenIds.set(server.id, resolved);
      }
    }
  }

  const valid = !issues.some((i) => i.severity === "error");
  return { valid, issues };
}

module.exports = {
  validateAllConfigs,
};
