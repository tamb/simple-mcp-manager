const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const pkg = require("../package.json");

describe("package", () => {
  it("exposes all CLI bin aliases", () => {
    assert.ok(pkg.bin["mcp-manager"]);
    assert.ok(pkg.bin["mcp-mgr"]);
    assert.ok(pkg.bin["simple-mcp-manager"]);
    assert.equal(pkg.bin["mcp-manager"], pkg.bin["mcp-mgr"]);
  });
});
