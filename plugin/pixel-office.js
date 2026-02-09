import path from "node:path";
import fs from "node:fs";

const DEFAULT_PORT = 5100;

const homeDir = process.env.HOME || process.env.USERPROFILE || "/";
const globalDistDir = path.join(homeDir, ".opencode", "pixel-office");

const getConfiguredPort = () => {
  try {
    const configPath = path.join(globalDistDir, "config.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf8");
      const data = JSON.parse(raw);
      if (data && typeof data.port === "number") {
        return data.port;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_PORT;
};

const resolveEndpoint = () => {
  const port = process.env.PIXEL_OFFICE_PORT || getConfiguredPort();
  const raw = process.env.PIXEL_OFFICE_URL || `http://localhost:${port}/events`;
  return raw.endsWith("/events") ? raw : `${raw.replace(/\/$/, "")}/events`;
};

export const PixelOfficePlugin = async ({ directory, worktree, client }) => {
  const endpoint = resolveEndpoint();

  return {
    event: async ({ event }) => {
      if (!event) {
        return;
      }
      try {
        // Add source tag to identify this is from OpenCode
        const taggedEvent = {
          ...event,
          source: "opencode",
        };
        await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(taggedEvent),
        });
      } catch {
        // Server not running, silently ignore
      }
    },
    dispose: async () => {},
  };
};
