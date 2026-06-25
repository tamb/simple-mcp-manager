const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { parseMcpConfig, makeServerId } = require("../src/core/discovery");

describe("discovery", () => {
  it("parses mcpServers shape and assigns stable id", () => {
    const configPath = path.join(__dirname, "fixtures", "cursor-mcp.json");
    const servers = parseMcpConfig(configPath, "mcpServers", "Cursor", "global");
    assert.equal(servers.length, 2);
    assert.equal(servers[0].name, "github");
    assert.equal(servers[0].id, makeServerId(configPath, "github"));
    assert.equal(servers[1].type, "http");
  });

  it("parses servers shape fallback", () => {
    const configPath = path.join(__dirname, "fixtures", "vscode-mcp.json");
    const servers = parseMcpConfig(configPath, "servers", "VS Code", "global");
    assert.equal(servers.length, 1);
    assert.equal(servers[0].command, "node");
  });

  it("returns empty array for invalid JSON", () => {
    const badPath = path.join(__dirname, "fixtures", "bad.json");
    require("node:fs").writeFileSync(badPath, "{ not json");
    const servers = parseMcpConfig(badPath, "mcpServers", "Cursor", "global");
    assert.deepEqual(servers, []);
    require("node:fs").unlinkSync(badPath);
  });
});
