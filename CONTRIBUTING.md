# Contributing to simple-mcp-manager

Thank you for your interest in contributing! This guide covers how to set up the project locally for development and testing.

## Development Setup

### 1. Clone and Install

```bash
git clone https://github.com/tamb/simple-mcp-manager.git
cd simple-mcp-manager
npm install
```

### 2. Run Locally (Without Installing)

```bash
# Terminal UI mode
node index.js

# Web UI mode
node index.js --ui

# Web UI with custom port
node index.js --ui --port 8080

# Validate MCP config files
node index.js --validate

# Scan extra workspace directories
node index.js --scan-dir /path/to/project --cwd /path/to/project
```

### 3. Run Tests

```bash
npm test
npm run lint
```

## Testing Globally with `npm link`

To test the package as if it were installed globally from npm (useful for testing the CLI commands):

### Link the Package

```bash
# From the project root directory
npm link
```

This creates a global symlink to your local package, making the `mcp-manager`, `mcp-mgr`, and `simple-mcp-manager` commands available globally.

### Test the Linked Package

```bash
# Now you can run it from anywhere on your system
mcp-manager              # Terminal UI mode
mcp-mgr --ui             # Web UI mode (short alias)
simple-mcp-manager       # Alternative command name
mcp-mgr --validate       # Validate configs
```

### Unlink When Done

```bash
# Remove the global link
npm unlink -g simple-mcp-manager

# Or from the project directory
npm unlink
```

## Creating a Local npm Pack

To test the exact package that would be published to npm:

### 1. Create the Pack

```bash
npm pack
```

This creates a tarball (e.g., `simple-mcp-manager-0.2.0.tgz`) in the current directory.

### 2. Install the Pack Globally

```bash
npm install -g simple-mcp-manager-0.2.0.tgz
```

### 3. Test It

```bash
mcp-mgr --ui
```

### 4. Uninstall

```bash
npm uninstall -g simple-mcp-manager
```

## Code Style

- Use double quotes for strings
- Use semicolons
- Keep functions focused and modular
- Add JSDoc comments for exported functions
- [Biome](https://biomejs.dev/) enforces formatting and lint rules (`biome.json`)
- Run `npm run lint` before submitting
- Run `npm run format` or `npm run check` to auto-fix formatting and safe lint fixes

## Project Structure

```
simple-mcp-manager/
├── index.js              # CLI entry point
├── package.json          # Package configuration
├── src/
│   ├── config/           # Config file handling
│   │   ├── constants.js  # Platform paths & constants
│   │   └── tools.js      # Tool-specific config parsing
│   ├── core/             # Core functionality
│   │   ├── actions.js    # Shared restart/kill actions
│   │   ├── discovery.js  # Server discovery from configs
│   │   ├── processes.js  # Process management (kill, start)
│   │   ├── serverState.js # Server list merge/sort/filter
│   │   └── validate.js   # Config validation
│   ├── ui/               # User interfaces
│   │   ├── tui.js        # Terminal UI (blessed)
│   │   └── web/          # Web UI (HTTP server + static SPA)
│   └── utils/            # Utilities
│       ├── logger.js     # File logging
│       ├── path.js       # Path helpers
│       ├── sanitize.js   # Env redaction for API/display
│       └── display.js    # Shared formatting helpers
├── test/                 # node:test suite
└── README.md             # User documentation
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run `npm test` and `npm run lint`
5. Test locally using `npm link` or `npm pack`
6. Commit with clear messages
7. Push to your fork
8. Open a pull request

## Questions?

Open an issue on GitHub if you need help or have questions about contributing.
