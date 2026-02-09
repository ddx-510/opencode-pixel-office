# Installation

## Quick Install

```bash
# Install globally
npm install -g opencode-pixel-office

# Install for both OpenCode and Claude Code
opencode-pixel-office install

# Start the server
opencode-pixel-office start
```

The dashboard opens at `http://localhost:5100`.

## What Gets Installed

The `install` command sets up everything automatically:

| Component | Location | Purpose |
|-----------|----------|---------|
| OpenCode Plugin | `~/.opencode/plugins/pixel-office.js` | Captures OpenCode events |
| Claude Code Hooks | `~/.claude/hooks/` + `settings.json` | Captures Claude Code events |
| Server/App | `~/.opencode/pixel-office/` | Runs the dashboard |

## CLI Commands

```bash
opencode-pixel-office install      # Install everything
opencode-pixel-office start        # Start server & open browser
opencode-pixel-office stop         # Stop the server
opencode-pixel-office status       # Check what's installed
opencode-pixel-office uninstall    # Remove everything
opencode-pixel-office --version    # Show version
```

### Options

- `--port <number>` - Custom port (default: 5100)

## Using with OpenCode

After installation, just start OpenCode. Events are automatically sent to Pixel Office.

## Using with Claude Code

After installation, just use Claude Code CLI. Events are automatically sent via hooks.

## Viewing the Dashboard

1. Run `opencode-pixel-office start`
2. Dashboard opens at `http://localhost:5100`
3. Use tabs to switch between **OpenCode Office** and **Claude Office**

## Mobile Access

1. Click the network URL in the top-right corner of the dashboard
2. Scan the QR code with your phone
3. View agents from anywhere on your local network

## Environment Variables

```bash
# Custom server URL (optional)
export PIXEL_OFFICE_URL="http://localhost:5100/events"

# Custom port (optional)
export PIXEL_OFFICE_PORT="5100"
```

## Uninstalling

```bash
opencode-pixel-office uninstall
```

This removes:
- OpenCode plugin
- Claude Code hooks
- Server/app directory
- All configuration

## For Developers

```bash
git clone https://github.com/anthropics/opencode-pixel-office.git
cd opencode-pixel-office
npm install

# Dev mode
npm start              # Server
npm run dev:client     # Client (separate terminal)

# Build
npm run build:client
```
