const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseServerIdFromPath, RESERVED_SERVER_IDS } = require("../src/ui/web/server");

describe("web API routing", () => {
  it("parses encoded server ids from action paths", () => {
    const id = "C:\\\\Users\\\\me\\\\.cursor\\\\mcp.json::github";
    const encoded = encodeURIComponent(id);
    assert.equal(parseServerIdFromPath(`/api/servers/${encoded}/restart`, "restart"), id);
  });

  it("rejects reserved path segments as ids", () => {
    for (const reserved of RESERVED_SERVER_IDS) {
      assert.equal(parseServerIdFromPath(`/api/servers/${reserved}/kill`, "kill"), null);
    }
  });
});
