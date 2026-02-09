# Pixel Office

A pixel-art office visualization for AI coding assistants. Works with both **OpenCode** and **Claude Code** simultaneously.

<img width="1455" height="824" alt="Pixel Office Screenshot" src="https://github.com/user-attachments/assets/e20e2e68-a032-4747-a027-aacca0f274e5" />

[![npm version](https://img.shields.io/npm/v/opencode-pixel-office.svg)](https://www.npmjs.com/package/opencode-pixel-office)

## Features

- **Dual Support**: Works with both OpenCode and Claude Code CLI
- **Live Visualization**: Real-time pixel-art office showing agent activity
- **Tabbed Interface**: Switch between OpenCode Office and Claude Office views
- **Mobile Ready**: Connect via local network + QR code
- **Session Tracking**: Monitor multiple sessions across different repos

## Quick Start

```bash
# Install globally
npm install -g opencode-pixel-office

# Install for both OpenCode and Claude Code
opencode-pixel-office install

# Start the server
opencode-pixel-office start
```

That's it! The dashboard opens at `http://localhost:5100`.

## CLI Commands

| Command | Description |
|---------|-------------|
| `install` | Install plugin + hooks for both OpenCode and Claude Code |
| `start` | Start the Pixel Office server |
| `stop` | Stop the server |
| `status` | Show installation status |
| `uninstall` | Remove everything |

### Options

- `--port <number>` - Set server port (default: 5100)
- `--version, -v` - Show version number

## How It Works

```
┌─────────────┐     ┌─────────────┐
│  OpenCode   │     │ Claude Code │
│   Plugin    │     │    Hooks    │
└──────┬──────┘     └──────┬──────┘
       │                   │
       │   HTTP POST       │
       └───────┬───────────┘
               ▼
       ┌───────────────┐
       │ Pixel Office  │
       │    Server     │
       │   :5100       │
       └───────┬───────┘
               │ WebSocket
               ▼
       ┌───────────────┐
       │    Browser    │
       │   Dashboard   │
       └───────────────┘
```

- **OpenCode Plugin** → `~/.opencode/plugins/pixel-office.js`
- **Claude Code Hooks** → `~/.claude/hooks/` + `~/.claude/settings.json`
- **Server/App** → `~/.opencode/pixel-office/`

## 📱 Mobile Support

Monitor your agents from your phone!

1. Click the Network URL in the top-right corner
2. Scan the QR code
3. Watch agents work from anywhere on your network

<img src="https://github.com/user-attachments/assets/c5420d78-9c87-4062-b034-21ae3defd52f" width="375" alt="Mobile View" />

## Development

```bash
# Clone the repo
git clone https://github.com/anthropics/opencode-pixel-office.git
cd opencode-pixel-office
npm install

# Run server (dev mode)
npm start

# Run client (dev mode, separate terminal)
npm run dev:client

# Build client for production
npm run build:client
```

## Project Structure

```
pixel-opencode/
├── client/                 # React + PixiJS Frontend
│   └── src/
│       ├── App.tsx         # Main app with tabs
│       ├── PixiScene.tsx   # Pixel art rendering
│       └── useOfficeState.ts
├── server/
│   └── index.ts            # Express + WebSocket server
├── plugin/
│   └── pixel-office.js     # OpenCode plugin
└── bin/
    ├── opencode-pixel-office.js  # CLI
    └── claude-code-hook.js       # Claude Code hook
```

## Credits

- **Tileset**: [Office Tileset by DonArg](https://donarg.itch.io/officetileset)
- **Icons**: Lucide React
- **Engine**: PixiJS
