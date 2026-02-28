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
```

## Testing Globally with `npm link`

To test the package as if it were installed globally from npm (useful for testing the CLI commands):

### Link the Package

```bash
# From the project root directory
npm link
```

This creates a global symlink to your local package, making the `mcp-manager` and `simple-mcp-manager` commands available globally.

### Test the Linked Package

```bash
# Now you can run it from anywhere on your system
mcp-manager              # Terminal UI mode
mcp-manager --ui       # Web UI mode
simple-mcp-manager     # Alternative command name
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

This creates a tarball (e.g., `simple-mcp-manager-0.1.0.tgz`) in the current directory.

### 2. Install the Pack Globally

```bash
npm install -g simple-mcp-manager-0.1.0.tgz
```

### 3. Test It

```bash
mcp-manager --ui
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
│   │   ├── discovery.js  # Server discovery from configs
│   │   └── processes.js  # Process management (kill, start)
│   ├── ui/               # User interfaces
│   │   ├── tui.js        # Terminal UI (blessed)
│   │   └── web.js        # Web UI (HTTP server)
│   └── utils/            # Utilities
│       ├── logger.js     # File logging
│       └── path.js       # Path helpers
└── README.md             # User documentation
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test locally using `npm link` or `npm pack`
5. Commit with clear messages
6. Push to your fork
7. Open a pull request

## Questions?

Open an issue on GitHub if you need help or have questions about contributing.
