import path from "node:path";
import fs from "node:fs";

const DEFAULT_PORT = 5100;

// Helper to get configured port
const getConfiguredPort = (globalDistDir) => {
  try {
    const configPath = path.join(globalDistDir, "config.json");
    if (fs.existsSync(configPath)) {
      const start = Date.now();
      // Read synchronously to ensure we have port for endpoint
      // This is okay as it's a tiny local JSON
      const raw = fs.readFileSync(configPath, "utf8");
      const data = JSON.parse(raw);
      if (data && typeof data.port === "number") {
        return data.port;
      }
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_PORT;
};

// We need to resolve home dir early to get config
const homeDir = process.env.HOME || process.env.USERPROFILE || "/";
const globalDistDir = path.join(homeDir, ".opencode", "pixel-office");
const configuredPort = getConfiguredPort(globalDistDir);

const resolveEndpoint = () => {
  const port = process.env.PIXEL_OFFICE_PORT || configuredPort;
  const raw =
    process.env.PIXEL_OFFICE_URL ||
    `http://localhost:${port}/events`;
  return raw.endsWith("/events") ? raw : `${raw.replace(/\/$/, "")}/events`;
};

const resolveServerUrl = (endpoint) => endpoint.replace(/\/events$/, "");

const resolveEndpointInfo = (endpoint, portOverride) => {
  try {
    const url = new URL(endpoint);
    const port = url.port ? Number(url.port) : portOverride;
    return {
      url,
      port,
      isLocal: url.hostname === "localhost" || url.hostname === "127.0.0.1",
    };
  } catch (error) {
    return { url: null, port: portOverride, isLocal: false };
  }
};

const resolveOpenCommand = (url) => {
  if (process.platform === "darwin") {
    return ["open", url];
  }
  if (process.platform === "win32") {
    return ["cmd", "/c", "start", "", url];
  }
  return ["xdg-open", url];
};

export const PixelOfficePlugin = async ({ directory, worktree, client }) => {
  const endpoint = resolveEndpoint();
  const serverUrl = resolveServerUrl(endpoint);
  const rootDir = worktree || directory;
  const endpointInfo = resolveEndpointInfo(endpoint, configuredPort);
  const openCommand = resolveOpenCommand(serverUrl);

  // Path Resolution
  const localServerPath = path.join(rootDir, "server", "index.ts");
  const globalServerPath = path.join(globalDistDir, "server", "index.ts");

  let serverCwd = rootDir;
  let serverScript = "server/index.ts";
  let useGlobal = false;

  if (fs.existsSync(localServerPath)) {
    // Local dev mode: run from workspace
    serverCwd = rootDir;
  } else if (fs.existsSync(globalServerPath)) {
    // Global standalone mode: run from ~/.opencode/pixel-office
    serverCwd = globalDistDir;
    useGlobal = true;
  } else {
    // Neither found
    if (endpointInfo.isLocal) {
      console.warn("[Pixel Office] Server not found locally or globally.");
    }
  }

  let serverProcess = null;
  let browserOpened = false;
  let warnedOnce = false;

  const startServerIfNeeded = async () => {
    if (!endpointInfo.isLocal || serverProcess) {
      return;
    }
    const env = {
      ...process.env,
      PORT: String(process.env.PIXEL_OFFICE_PORT || endpointInfo.port),
    };

    let cmd = ["tsx", serverScript];
    if (useGlobal) {
      const globalTsx = path.join(serverCwd, "node_modules", ".bin", "tsx");
      if (fs.existsSync(globalTsx)) {
        cmd = [globalTsx, serverScript];
      }
    }

    try {
      serverProcess = Bun.spawn({
        cmd,
        cwd: serverCwd,
        env,
        stdout: "ignore",
        stderr: "ignore",
      });
      // console.log(`[Pixel Office] Started server in ${serverCwd} on port ${env.PORT}`);
    } catch (error) {
      await client.app.log({
        service: "pixel-office",
        level: "error",
        message: "Failed to start Pixel Office server",
        extra: { error: String(error), cwd: serverCwd },
      });
    }
  };

  const openBrowserIfNeeded = async () => {
    if (!endpointInfo.isLocal || browserOpened) {
      return;
    }
    browserOpened = true;
    try {
      Bun.spawn({ cmd: openCommand, stdout: "ignore", stderr: "ignore" });
    } catch (error) {
      await client.app.log({
        service: "pixel-office",
        level: "warn",
        message: "Failed to open Pixel Office browser",
        extra: { error: String(error), url: serverUrl },
      });
    }
  };

  await startServerIfNeeded();
  await openBrowserIfNeeded();

  return {
    event: async ({ event }) => {
      if (!event) {
        return;
      }
      try {
        await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        });
      } catch (error) {
        if (!warnedOnce) {
          warnedOnce = true;
        }
      }
    },
    dispose: async () => {
      if (serverProcess) {
        // console.log("[Pixel Office] Killing server process...");
        serverProcess.kill();
        serverProcess = null;
      }
    },
  };
};
