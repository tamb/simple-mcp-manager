# MCP Server Manager

Interactive terminal UI for monitoring and restarting MCP (Model Context Protocol) servers across multiple AI tools. Works on Windows, macOS, and Linux.

## Supported Tools

| Tool | Config Locations |
|------|-----------------|
| **Cursor** | `~/.cursor/mcp.json`, `%APPDATA%\Cursor\User\mcp.json`, per-project in `~/.cursor/projects/*/mcp.json`, workspace `.cursor/mcp.json` |
| **VS Code (Copilot)** | `~/.vscode/mcp.json`, `%APPDATA%\Code\User\mcp.json` (Win), `~/Library/Application Support/Code/User/mcp.json` (Mac), `~/.config/Code/User/mcp.json` (Linux), workspace `.vscode/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json`, `%APPDATA%\Windsurf\User\mcp_config.json` (Win), `~/Library/Application Support/Windsurf/User/mcp_config.json` (Mac), `~/.config/Windsurf/User/mcp_config.json` (Linux), workspace `.windsurf/mcp.json` |
| **Claude Desktop** | `%APPDATA%\Claude\claude_desktop_config.json` (Win), `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac), `~/.config/claude/claude_desktop_config.json` (Linux) |
| **Claude Code** | `~/.claude/mcp.json`, `~/.claude.json`, workspace `.claude/mcp.json` |
| **GitHub Copilot** | `~/.mcp.json`, workspace `.mcp.json` |

Most agents use `{ "mcpServers": { ... } }` format; GitHub Copilot and VS Code use `{ "servers": { ... } }`. The manager auto-detects both formats and checks for config files across all supported agents.

## Quick Start

```bash
npm install
npm start
```

## What Is This?

A **standalone CLI tool** you run in a separate terminal. It is not an MCP server and does not need to be installed into any AI tool. It reads all your MCP configs, shows which servers are running or crashed, and lets you kill or restart them.

## Keybindings

| Key     | Action                          |
| ------- | ------------------------------- |
| `r`     | Restart the selected server     |
| `k`     | Kill the selected server        |
| `K`     | Kill all running servers        |
| `a`     | Restart all stopped servers     |
| `F5`    | Manual refresh                  |
| `d`     | Show server details             |
| Up/Down | Navigate server list            |
| `q`     | Quit                            |

## Cross-Platform Support

| Feature | Windows | macOS | Linux | WSL |
|---------|---------|-------|-------|-----|
| Process detection | PowerShell | `ps aux` | `ps aux` | PowerShell (Windows processes) |
| Kill process | `taskkill /PID /F` (per process) | `kill` SIGTERM/SIGKILL | `kill` SIGTERM/SIGKILL | `taskkill.exe /PID /F` |
| Spawn process | `shell: true` for `.cmd` | detached | detached | `cmd.exe /C` (Windows side) |

On WSL, the manager detects Windows processes so it can see servers started by Cursor/VS Code/Copilot on the Windows side; refresh runs every 15s there to avoid slow PowerShell queries.

## How It Works

1. Scans all known config file locations for each supported tool
2. Parses the `mcpServers` entries from each config
3. Matches running processes against each server's command/package name
4. Displays everything in a live-updating table grouped by tool
5. Auto-refreshes every 5 seconds (15 seconds on WSL)
6. Detail view (`d`) shows the full config, config file path, and environment variables (secrets masked)

## Requirements

- Node.js >= 18
