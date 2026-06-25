const SENSITIVE_PATTERN = /token|key|password|secret|api/i;

/**
 * Mask a sensitive env value for display.
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
function maskSensitiveValue(key, value) {
  if (typeof value !== "string") return value;
  if (SENSITIVE_PATTERN.test(key) && value.length > 10) {
    return `${value.slice(0, 6)}******${value.slice(-4)}`;
  }
  return value;
}

/**
 * Return a copy of env with sensitive values masked.
 * @param {Record<string, string>} env
 * @returns {Record<string, string>}
 */
function maskSensitiveEnv(env) {
  const result = {};
  for (const [k, v] of Object.entries(env || {})) {
    result[k] = maskSensitiveValue(k, v);
  }
  return result;
}

/**
 * Return a server object safe for JSON API responses (env redacted, logs omitted by default).
 * @param {object} server
 * @param {{ includeLogs?: boolean }} [opts]
 * @returns {object}
 */
function sanitizeServerForApi(server, opts = {}) {
  const { logs, ...rest } = server;
  const safe = {
    ...rest,
    env: maskSensitiveEnv(server.env),
    logCount: Array.isArray(logs) ? logs.length : 0,
  };
  if (opts.includeLogs) {
    safe.logs = logs;
  }
  return safe;
}

module.exports = {
  SENSITIVE_PATTERN,
  maskSensitiveValue,
  maskSensitiveEnv,
  sanitizeServerForApi,
};
