const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { maskSensitiveEnv, sanitizeServerForApi } = require("../src/utils/sanitize");

describe("sanitize", () => {
  it("masks sensitive env keys", () => {
    const masked = maskSensitiveEnv({
      GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz1234567890",
      NODE_ENV: "production",
    });
    assert.match(masked.GITHUB_TOKEN, /\*\*\*\*\*\*/);
    assert.equal(masked.NODE_ENV, "production");
  });

  it("sanitizeServerForApi redacts env and omits logs by default", () => {
    const server = {
      name: "s",
      env: { API_KEY: "sk-1234567890abcdefghijklmnop" },
      logs: [{ ts: 1, stream: "stdout", line: "hello" }],
    };
    const safe = sanitizeServerForApi(server);
    assert.match(safe.env.API_KEY, /\*\*\*\*\*\*/);
    assert.equal(safe.logCount, 1);
    assert.equal(safe.logs, undefined);
    assert.match(server.env.API_KEY, /^sk-/);
  });
});
