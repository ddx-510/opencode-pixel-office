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

const post = async (endpoint, payload) => {
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payload, source: "opencode" }),
    });
  } catch {
    // Pixel Office server not running, silently ignore.
  }
};

// OpenCode 2.x emits a different event envelope ({ id, created, type, location, data })
// and different event names than 1.x. The Pixel Office server still speaks the legacy
// shape ({ type, properties }), so translate each V2 event into its closest V1 equivalent.
const translateV2Event = (event, sessionMeta = new Map()) => {
  const type = event?.type;
  const data = event?.data || {};
  const sessionID = data.sessionID || "";
  const messageInfo = { sessionID, id: data.assistantMessageID || "" };

  // Only session.step.started carries the agent name + model. Cache them per session so later
  // tool events reuse them; otherwise the server creates a phantom agent keyed by the bare
  // session id (name "ses_...", model "unknown") alongside the real one.
  const prev = sessionMeta.get(sessionID) || {};
  if (type === "session.step.started" && sessionID && (data.agent || data.model)) {
    sessionMeta.set(sessionID, { ...prev, agent: data.agent, model: data.model });
  }
  // session.tool.input.started carries the tool name; session.tool.called does not. Cache the
  // name by call id so tool events can report the real tool name.
  if (type === "session.tool.input.started" && sessionID && data.id && data.name) {
    sessionMeta.set(sessionID, { ...prev, tools: { ...(prev.tools || {}), [data.id]: data.name } });
  }
  const meta = sessionMeta.get(sessionID) || {};
  const toolName = (data.id && meta.tools && meta.tools[data.id]) || data.name || "tool";
  const agentInfo = {
    agent: meta.agent || "opencode",
    model: {
      modelID: meta.model?.id || "",
      providerID: meta.model?.providerID || "",
    },
  };
  // V2 does not expose todos, so the (repurposed) Quest Log lists the tools running live.
  const runningToolTodos = () => {
    const current = sessionMeta.get(sessionID) || {};
    return Object.entries(current.tools || {}).map(([id, name]) => ({
      id,
      content: name,
      status: "in_progress",
      priority: "",
    }));
  };

  switch (type) {
    // A new agent step started: register/refresh the agent and mark it working.
    case "session.step.started": {
      const mapped = [
        {
          type: "tool.execute.before",
          properties: {
            sessionID,
            info: {
              agent: data.agent || "opencode",
              sessionID,
              model: {
                modelID: data.model?.id || "",
                providerID: data.model?.providerID || "",
              },
            },
            tool: { name: "step" },
          },
        },
      ];
      // Mission Log: V2 never emits session.created/updated, so synthesize one so the server
      // registers the session (directory normalized to forward slashes for the UI).
      const directory = event?.location?.directory || "";
      if (directory) {
        mapped.push({
          type: "session.updated",
          properties: {
            info: {
              id: sessionID,
              directory: directory.replace(/\\/g, "/"),
              title: "",
              slug: "",
            },
          },
        });
      }
      return mapped;
    }

    // A tool was invoked: "working" + tool name.
    case "session.tool.called": {
      return [
        {
          type: "tool.execute.before",
          properties: {
            sessionID,
            info: { ...messageInfo, ...agentInfo },
            tool: { name: toolName, input: data.input },
          },
        },
      ];
    }

    // The tool name only arrives here: refresh the live tool list in the Quest Log.
    case "session.tool.input.started": {
      return [{ type: "todo.updated", properties: { sessionID, todos: runningToolTodos() } }];
    }

    // A tool finished: "thinking". Drop it from the live tool list.
    case "session.tool.success": {
      const current = sessionMeta.get(sessionID);
      const wasTracked = !!(current && current.tools && data.id && current.tools[data.id]);
      if (current && current.tools && data.id) {
        delete current.tools[data.id];
      }
      const mapped = [
        {
          type: "tool.execute.after",
          properties: {
            sessionID,
            info: { ...messageInfo, ...agentInfo },
            tool: { output: data.content },
          },
        },
      ];
      // Only refresh the Quest Log when this tool was actually listed there.
      if (wasTracked) {
        mapped.push({ type: "todo.updated", properties: { sessionID, todos: runningToolTodos() } });
      }
      return mapped;
    }

    // Streamed assistant text: message part update, drives the live snippet.
    case "session.text.delta":
    case "session.reasoning.delta": {
      const delta = data.delta || "";
      if (!delta) {
        return [];
      }
      return [
        {
          type: "message.part.updated",
          properties: {
            sessionID,
            info: messageInfo,
            part: {
              id: `${data.assistantMessageID || "msg"}:${data.ordinal ?? 0}`,
              messageID: data.assistantMessageID || "",
              sessionID,
              type: type === "session.reasoning.delta" ? "reasoning" : "text",
              text: delta,
              delta,
            },
          },
        },
      ];
    }

    // The turn finished: clear the live tool list and go idle.
    case "session.step.ended": {
      const current = sessionMeta.get(sessionID);
      const hadTools = !!(current && current.tools && Object.keys(current.tools).length);
      if (current && current.tools) {
        current.tools = {};
      }
      const mapped = [];
      if (data.finish && data.finish !== "tool-calls") {
        mapped.push({ type: "session.idle", properties: { sessionID } });
      }
      // Only clear the Quest Log when tools were actually listed there.
      if (hadTools) {
        mapped.push({ type: "todo.updated", properties: { sessionID, todos: [] } });
      }
      return mapped;
    }

    // The user's prompt was queued: surface it as the "boss message".
    case "session.inbox.enqueued": {
      const item = data.item || {};
      const text = item.type === "user" ? item.payload?.text || "" : "";
      if (!text) {
        return [];
      }
      const messageID = data.inboxID || `${sessionID}:user`;
      return [
        {
          type: "message.part.updated",
          properties: {
            sessionID,
            info: { role: "user", sessionID },
            part: {
              id: `${messageID}:user`,
              messageID,
              sessionID,
              type: "user",
              text,
            },
          },
        },
      ];
    }

    default:
      return [];
  }
};

const plugin = {
  id: "pixel-office",

  // OpenCode 2.x entrypoint.
  async setup(ctx) {
    const endpoint = resolveEndpoint();
    const controller = new AbortController();
    const sessionMeta = new Map();

    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (!event || !event.type) {
            continue;
          }
          for (const mapped of translateV2Event(event, sessionMeta)) {
            await post(endpoint, mapped);
          }
        }
      } catch {
        // Stream aborted on dispose.
      }
    })();

    return () => controller.abort();
  },
};

// Backwards compatibility with OpenCode 1.18.x (V1 plugin API). V1 events already use
// the legacy { type, properties } shape, so they are forwarded as-is.
plugin.server = async () => {
  const endpoint = resolveEndpoint();
  return {
    event: async ({ event }) => {
      if (event) {
        await post(endpoint, event);
      }
    },
  };
};

export default plugin;

// Exported for unit testing of the V2 -> V1 event translation.
export { translateV2Event };
