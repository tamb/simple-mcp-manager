"use strict";

const path = require("path");
const { IS_WIN, IS_MAC, IS_WSL, HOME, WIN_HOME, APPDATA, XDG_CONFIG } = require("./constants");

// ── Tool Definitions ────────────────────────────────────────────────────────
// Each tool defines where its MCP config lives on each platform.
// configKey is the JSON key that holds the server map (usually "mcpServers").

const TOOLS = [
  {
    name: "Cursor",
    configKey: "mcpServers",
    paths: {
      global: [
        // Cursor in WSL uses the Linux home; on native Windows uses APPDATA
        path.join(HOME, ".cursor", "mcp.json"),
        ...(IS_WIN ? [path.join(APPDATA, "Cursor", "User", "mcp.json")] : []),
        ...(IS_WSL && APPDATA ? [path.join(APPDATA, "Cursor", "User", "mcp.json")] : []),
      ],
      projects: [path.join(HOME, ".cursor", "projects")],
      workspace: [".cursor/mcp.json"],
    },
    projectGlob: "mcp.json",
  },
  {
    name: "VS Code",
    configKey: "servers",
    paths: {
      global: [
        path.join(HOME, ".vscode", "mcp.json"),
        ...(IS_WIN
          ? [path.join(APPDATA, "Code", "User", "mcp.json")]
          : IS_MAC
            ? [path.join(HOME, "Library", "Application Support", "Code", "User", "mcp.json")]
            : [path.join(XDG_CONFIG, "Code", "User", "mcp.json")]),
        ...(IS_WSL && APPDATA ? [path.join(APPDATA, "Code", "User", "mcp.json")] : []),
      ],
      projects: [],
      workspace: [".vscode/mcp.json"],
    },
    projectGlob: null,
  },
  {
    name: "Windsurf",
    configKey: "mcpServers",
    paths: {
      global: [
        path.join(HOME, ".codeium", "windsurf", "mcp_config.json"),
        ...(IS_WIN
          ? [path.join(APPDATA, "Windsurf", "User", "mcp_config.json")]
          : IS_MAC
            ? [path.join(HOME, "Library", "Application Support", "Windsurf", "User", "mcp_config.json")]
            : [path.join(XDG_CONFIG, "Windsurf", "User", "mcp_config.json")]),
        ...(IS_WSL && APPDATA ? [path.join(APPDATA, "Windsurf", "User", "mcp_config.json")] : []),
      ],
      projects: [],
      workspace: [".windsurf/mcp.json"],
    },
    projectGlob: null,
  },
  {
    name: "Claude Desktop",
    configKey: "mcpServers",
    paths: {
      global: [
        ...(IS_WIN
          ? [path.join(APPDATA, "Claude", "claude_desktop_config.json")]
          : IS_MAC
            ? [path.join(HOME, "Library", "Application Support", "Claude", "claude_desktop_config.json")]
            : [path.join(XDG_CONFIG, "claude", "claude_desktop_config.json")]),
        ...(IS_WSL && APPDATA ? [path.join(APPDATA, "Claude", "claude_desktop_config.json")] : []),
      ],
      projects: [],
      workspace: [],
    },
    projectGlob: null,
  },
  {
    name: "GitHub Copilot",
    configKey: "servers",
    paths: {
      global: [
        // GitHub Copilot is a Windows app — uses the Windows user profile
        ...(WIN_HOME && WIN_HOME !== HOME ? [path.join(WIN_HOME, ".mcp.json")] : []),
        path.join(HOME, ".mcp.json"),
      ],
      projects: [],
      workspace: [".mcp.json"],
    },
    projectGlob: null,
  },
  {
    name: "Claude Code",
    configKey: "mcpServers",
    paths: {
      global: [
        path.join(HOME, ".claude", "mcp.json"),
        path.join(HOME, ".claude.json"),
      ],
      projects: [],
      workspace: [".claude/mcp.json"],
    },
    projectGlob: null,
  },
];

module.exports = {
  TOOLS,
};
