# Installation

## For humans

This is the end-user flow (no git clone).

### Step 1: Install the package

```bash
npm install -g opencode-pixel-office
```

### Step 2: Enable the plugin (JSON only)

Run the installer (this updates `opencode.json`):

```bash
opencode-pixel-office install
```

Or add it manually to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "opencode-pixel-office@latest"
  ]
}
```

### Step 3: Start OpenCode

When OpenCode loads the plugin, it will:

- start the Pixel Office server automatically (local endpoint only)
- open the dashboard in your default browser
- stream all OpenCode events to the server

Default UI: `http://localhost:5100`

### Configuration

```bash
export PIXEL_OFFICE_URL="http://localhost:5100/events"
```

If the endpoint is not local, the plugin will not attempt to start a server or open a browser.

## For LLM agents

When asked to install, follow this exact sequence:

1) Install the package:

```bash
npm install -g opencode-pixel-office
```

2) Enable the plugin using the CLI installer:

```bash
opencode-pixel-office install
```

3) Tell the user to start OpenCode and open `http://localhost:5100`.

## For maintainers

### Local development

```bash
npm install
npm run build:client
npm start
```

### Package the plugin

```bash
mkdir -p dist/plugin
cp plugin/pixel-office.js dist/plugin/pixel-office.js
```

### Publish to npm

```bash
npm publish
```

## Interactive installer

The CLI installer copies the plugin into your OpenCode plugin directory and updates `opencode.json`.

```bash
opencode-pixel-office install
```

Optional flags:

```bash
opencode-pixel-office install --config ~/.config/opencode/opencode.json
```
