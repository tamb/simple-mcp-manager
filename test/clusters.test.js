const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { findServerClusters } = require("../src/core/processes");

describe("findServerClusters", () => {
  it("groups parent-child matching processes", () => {
    const processes = [
      { pid: 100, ppid: 1, command: "cmd.exe /C npx @scope/pkg" },
      { pid: 101, ppid: 100, command: "node @scope/pkg" },
    ];
    const server = {
      command: "npx",
      args: ["@scope/pkg"],
    };
    const clusters = findServerClusters(server, processes);
    assert.equal(clusters.length, 1);
    assert.ok(clusters[0].has(100));
    assert.ok(clusters[0].has(101));
  });

  it("returns empty when no match", () => {
    const processes = [{ pid: 200, ppid: 1, command: "other process" }];
    const clusters = findServerClusters({ command: "npx", args: ["@missing/pkg"] }, processes);
    assert.deepEqual(clusters, []);
  });
});
