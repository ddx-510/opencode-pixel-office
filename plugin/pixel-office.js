const DEFAULT_PORT = 3000;
const resolveEndpoint = () => {
  const raw =
    process.env.PIXEL_OFFICE_URL ||
    `http://localhost:${DEFAULT_PORT}/events`;
  return raw.endsWith("/events") ? raw : `${raw.replace(/\/$/, "")}/events`;
};

const resolveServerUrl = (endpoint) => endpoint.replace(/\/events$/, "");

const resolveEndpointInfo = (endpoint) => {
  try {
    const url = new URL(endpoint);
    const port = url.port ? Number(url.port) : DEFAULT_PORT;
    return {
      url,
      port,
      isLocal: url.hostname === "localhost" || url.hostname === "127.0.0.1",
    };
  } catch (error) {
    return { url: null, port: DEFAULT_PORT, isLocal: false };
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
  const endpointInfo = resolveEndpointInfo(endpoint);
  const openCommand = resolveOpenCommand(serverUrl);
  let serverProcess = null;
  let browserOpened = false;

  const startServerIfNeeded = async () => {
    if (!endpointInfo.isLocal || serverProcess) {
      return;
    }
    const env = {
      ...process.env,
      PORT: String(process.env.PIXEL_OFFICE_PORT || endpointInfo.port),
    };
    try {
      serverProcess = Bun.spawn({
        cmd: ["tsx", "server/index.ts"],
        cwd: rootDir,
        env,
        stdout: "ignore",
        stderr: "ignore",
      });
    } catch (error) {
      await client.app.log({
        service: "pixel-office",
        level: "error",
        message: "Failed to start Pixel Office server",
        extra: { error: String(error) },
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
        console.error("PixelOfficePlugin failed to send event", error);
      }
    },
  };
};
