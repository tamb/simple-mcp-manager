const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getSearchTerms } = require("../src/core/processes");

describe("getSearchTerms", () => {
  it("extracts npx package name", () => {
    const terms = getSearchTerms({
      command: "npx",
      args: ["-y", "@scope/my-server"],
    });
    assert.ok(terms.includes("@scope/my-server"));
  });

  it("uses first non-flag arg for node interpreter", () => {
    const terms = getSearchTerms({
      command: "node",
      args: ["--experimental", "/home/user/mcp/server.js"],
    });
    assert.ok(terms.includes("/home/user/mcp/server.js"));
  });

  it("falls back to last arg when no other terms", () => {
    const terms = getSearchTerms({
      command: "",
      args: ["--help"],
    });
    assert.deepEqual(terms, ["--help"]);
  });
});
