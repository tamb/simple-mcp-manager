const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getStatusDisplay, formatCommandDisplay } = require("../src/utils/display");

describe("display", () => {
  it("labels http-ok distinctly from generic http", () => {
    assert.equal(getStatusDisplay({ status: "http-ok" }).text, "≡ HTTP OK");
    assert.equal(getStatusDisplay({ status: "http" }).text, "≡ HTTP");
  });

  it("formats sse endpoints by hostname", () => {
    assert.equal(
      formatCommandDisplay({ type: "sse", url: "https://mcp.example.com/sse" }),
      "mcp.example.com",
    );
  });
});
