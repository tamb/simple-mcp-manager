# simple-mcp-manager — MCP Server Manager

**Monitor and restart MCP (Model Context Protocol) servers** for Cursor, VS Code, Windsurf, Claude Desktop, Claude Code, and GitHub Copilot from one terminal. A lightweight TUI (terminal UI) that discovers your MCP configs, shows which servers are running or stopped, and lets you kill or restart them—no install into any AI tool required.

[![npm](https://img.shields.io/npm/v/simple-mcp-manager)](https://www.npmjs.com/package/simple-mcp-manager) [![Node](https://img.shields.io/node/v/simple-mcp-manager)](https://nodejs.org) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Works on **Windows**, **macOS**, **Linux**, and **WSL**.

## Quick Start (no install)

Run with [npx](https://docs.npmjs.com/cli/v8/commands/npx) — no clone or global install needed:

```bash
npx simple-mcp-manager
```

Or install and run:

```bash
npm install -g simple-mcp-manager
mcp-manager
```

Or clone and run locally:

```bash
git clone https://github.com/tamb/simple-mcp-manager.git
cd simple-mcp-manager
npm install
npm start
```

## What is this?

A **standalone CLI** you run in a separate terminal. It is **not** an MCP server and does **not** need to be installed into Cursor, VS Code, or any other tool. It:

- Scans MCP config files for all supported AI tools
- Lists every configured MCP server with run/stop status
- Lets you **restart**, **kill**, or **restart all stopped** servers from the TUI
- Works across Cursor, VS Code, Windsurf, Claude Desktop, Claude Code, and GitHub Copilot in one place

## Supported tools & config locations

| Tool | Config locations |
|------|------------------|
| **Cursor** | `~/.cursor/mcp.json`, `%APPDATA%\Cursor\User\mcp.json`, per-project in `~/.cursor/projects/*/mcp.json`, workspace `.cursor/mcp.json` |
| **VS Code** | `~/.vscode/mcp.json`, `%APPDATA%\Code\User\mcp.json` (Win), `~/Library/Application Support/Code/User/mcp.json` (Mac), `~/.config/Code/User/mcp.json` (Linux), workspace `.vscode/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json`, `%APPDATA%\Windsurf\User\mcp_config.json` (Win), `~/Library/Application Support/Windsurf/User/mcp_config.json` (Mac), `~/.config/Windsurf/User/mcp_config.json` (Linux), workspace `.windsurf/mcp.json` |
| **Claude Desktop** | `%APPDATA%\Claude\claude_desktop_config.json` (Win), `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac), `~/.config/claude/claude_desktop_config.json` (Linux) |
| **Claude Code** | `~/.claude/mcp.json`, `~/.claude.json`, workspace `.claude/mcp.json` |
| **GitHub Copilot** | `~/.mcp.json`, workspace `.mcp.json` |

Most tools use `{ "mcpServers": { ... } }`; GitHub Copilot and VS Code use `{ "servers": { ... } }`. The manager auto-detects both.

## Keybindings

| Key | Action |
|-----|--------|
| `r` | Restart the selected server |
| `k` | Kill the selected server |
| `K` | Kill all running servers |
| `a` | Restart all stopped servers |
| `F5` | Manual refresh |
| `d` | Show server details |
| Up/Down | Navigate server list |
| `q` | Quit |

## Cross-platform support

| Feature | Windows | macOS | Linux | WSL |
|---------|---------|-------|-------|-----|
| Process detection | PowerShell | `ps aux` | `ps aux` | PowerShell (Windows processes) |
| Kill process | `taskkill /PID /F` (per process) | `kill` SIGTERM/SIGKILL | `kill` SIGTERM/SIGKILL | `taskkill.exe /PID /F` |
| Spawn process | `shell: true` for `.cmd` | detached | detached | `cmd.exe /C` (Windows side) |

On WSL, the manager detects Windows processes so it can see servers started by Cursor, VS Code, or Copilot on the Windows side; refresh runs every 15s there to avoid slow PowerShell queries.

## How it works

1. Scans all known config file locations for each supported tool  
2. Parses `mcpServers` (or `servers`) from each config  
3. Matches running processes to each server’s command/package name  
4. Shows everything in a live-updating table grouped by tool  
5. Auto-refreshes every 5 seconds (15 seconds on WSL)  
6. Detail view (`d`) shows full config path and environment variables (secrets masked)  

## Requirements

- **Node.js** >= 18

## Links

- **Repository:** [github.com/tamb/simple-mcp-manager](https://github.com/tamb/simple-mcp-manager)  
- **npm:** [simple-mcp-manager](https://www.npmjs.com/package/simple-mcp-manager)  
- **Model Context Protocol (MCP):** [modelcontextprotocol.io](https://modelcontextprotocol.io)
