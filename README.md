# OpenCode Pixel Office

Pixel office visualization that listens to OpenCode plugin events and renders agent activity in real time.

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Build the client:

```bash
npm run build:client
```

3. Start the server:

```bash
npm start
```

4. Open the UI:

- Visit `http://localhost:3000`

## OpenCode plugin setup

1. Copy the plugin into your OpenCode plugin directory:

```bash
mkdir -p .opencode/plugins
cp plugin/pixel-office.js .opencode/plugins/pixel-office.js
```

2. (Optional) Change the target endpoint:

```bash
export PIXEL_OFFICE_URL="http://localhost:3000/events"
```

When the plugin loads, it will start the local Pixel Office server (if the
endpoint is local) and open the dashboard in your default browser.

OpenCode will load the plugin on startup and forward all events to the server.

## Event mapping

The UI maps common OpenCode events into activity states:

- `tool.execute.before` -> working
- `tool.execute.after` / message events -> thinking
- `session.idle` -> idle
- `session.error` -> error
- `session.compacted` -> planning

If `session.status` emits a concrete status string, the UI will use it directly.
