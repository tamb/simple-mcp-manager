const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { reloadServers, findServerById, filterServers } = require("../src/core/serverState");
const { makeServerId, loadAllServers } = require("../src/core/discovery");

describe("serverState", () => {
  it("reloadServers removes servers no longer in configs", () => {
    const fakeId = makeServerId("/nonexistent/ghost-mcp.json", "ghost");
    const servers = [{ id: fakeId, name: "ghost", configPath: "/nonexistent/ghost-mcp.json" }];
    const result = reloadServers(servers);
    assert.equal(result.removed, 1);
    assert.equal(
      result.servers.find((s) => s.id === fakeId),
      undefined,
    );
  });

  it("reloadServers preserves pid for servers still in configs", () => {
    const loaded = loadAllServers();
    if (loaded.length === 0) return;

    const server = { ...loaded[0], pid: 99999, status: "running" };
    const result = reloadServers([server]);
    const kept = result.servers.find((s) => s.id === server.id);
    assert.ok(kept);
    assert.equal(kept.pid, 99999);
  });

  it("findServerById locates server", () => {
    const id = makeServerId("/a/mcp.json", "x");
    const servers = [{ id, name: "x" }];
    assert.equal(findServerById(servers, id).name, "x");
    assert.equal(findServerById(servers, "missing"), undefined);
  });

  it("filterServers matches query text", () => {
    const servers = [
      { name: "alpha", tool: "Cursor", command: "node", args: [], configPath: "", type: "stdio" },
      { name: "beta", tool: "VS Code", command: "npx", args: [], configPath: "", type: "stdio" },
    ];
    const filtered = filterServers(servers, { query: "cursor" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].name, "alpha");
  });
});
