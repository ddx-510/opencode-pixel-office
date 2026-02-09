#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
};

const postEvent = async (endpoint, event) => {
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch (error) {
    // Silently ignore - server might not be running
  }
};

const getProjectName = (cwd) => {
  if (!cwd) return "Claude Code";
  const parts = cwd.split(path.sep).filter(Boolean);
  return parts[parts.length - 1] || "Claude Code";
};

const getModelFromEnv = () => {
  const model = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || "";
  if (model.includes("opus")) return "claude-opus";
  if (model.includes("sonnet")) return "claude-sonnet";
  if (model.includes("haiku")) return "claude-haiku";
  return "claude";
};

const mapHookToEvent = (input) => {
  const hook = input.hook_event_name || "";
  const sessionId = input.session_id || "";
  const cwd = input.cwd || "";
  const toolName = input.tool_name || "";
  const toolInput = input.tool_input || {};
  const toolOutput = input.tool_output || {};
  const prompt = input.prompt || input.user_prompt || "";
  const permission = input.permission || {};
  const message = input.message || "";

  const projectName = getProjectName(cwd);
  const agentId = sessionId || `claude-${Date.now()}`;
  const modelId = getModelFromEnv();

  const info = {
    id: agentId,
    sessionID: sessionId,
    agent: "Claude",
    title: projectName,
    directory: cwd,
    model: {
      modelID: modelId,
      providerID: "anthropic",
    },
  };

  let event = null;

  switch (hook) {
    case "SessionStart":
      event = {
        type: "session.created",
        properties: {
          info: {
            ...info,
            title: projectName,
            slug: projectName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
          },
        },
      };
      break;

    case "SessionEnd":
      event = {
        type: "session.deleted",
        properties: {
          sessionID: sessionId,
          info,
        },
      };
      break;

    case "UserPromptSubmit":
      event = {
        type: "message.updated",
        properties: {
          info: { ...info, role: "user" },
          message: {
            id: `msg-${Date.now()}`,
            content: prompt,
            role: "user",
            status: "pending",
          },
        },
      };
      break;

    case "PreToolUse":
      event = {
        type: "tool.execute.before",
        properties: {
          info,
          tool: { name: toolName, input: toolInput },
        },
      };
      break;

    case "PostToolUse":
      event = {
        type: "tool.execute.after",
        properties: {
          info,
          tool: { name: toolName, input: toolInput, output: toolOutput },
          status: "success",
        },
      };
      break;

    case "PostToolUseFailure":
      event = {
        type: "tool.execute.after",
        properties: {
          info,
          tool: { name: toolName, input: toolInput, output: toolOutput },
          status: "error",
        },
      };
      break;

    case "PermissionRequest":
      event = {
        type: "permission.asked",
        properties: {
          info,
          permission: { ...permission, tool: toolName },
        },
      };
      break;

    case "Notification":
      event = {
        type: "tui.toast.show",
        properties: { info, message },
      };
      break;

    case "PreCompact":
      event = {
        type: "session.compacted",
        properties: { info },
      };
      break;

    case "Stop":
      event = {
        type: "session.status",
        properties: {
          sessionID: sessionId,
          info,
          status: { type: "idle" },
        },
      };
      break;

    case "SubagentStart":
      event = {
        type: "session.updated",
        properties: {
          info: {
            ...info,
            agent: input.subagent_type || "Subagent",
            title: `${projectName} (${input.subagent_type || "Task"})`,
          },
          parentSessionId: sessionId,
        },
      };
      break;

    case "SubagentStop":
      event = {
        type: "session.idle",
        properties: {
          sessionID: input.subagent_id || sessionId,
          info,
        },
      };
      break;

    default:
      return null;
  }

  // Add source tag to identify this is from Claude Code
  if (event) {
    event.source = "claude";
  }

  return event;
};

const main = async () => {
  const raw = await readStdin();
  if (!raw) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const endpoint = process.env.PIXEL_OFFICE_URL || "http://localhost:5100/events";
  const event = mapHookToEvent(input);

  if (!event) {
    process.exit(0);
  }

  await postEvent(endpoint, event);
  process.exit(0);
};

main().catch(() => process.exit(0));
