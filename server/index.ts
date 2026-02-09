import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT || "5100", 10);
const CLIENT_DIST_DIR = path.join(__dirname, "..", "client", "dist");
const CLIENT_DIR = fs.existsSync(CLIENT_DIST_DIR)
  ? CLIENT_DIST_DIR
  : path.join(__dirname, "..", "client");

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(CLIENT_DIR));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

type BossMessage = {
  text: string;
  status?: string;
  updatedAt: number;
};

type TodoSummary = {
  total: number;
  completed: number;
  updatedAt: number;
};

type TodoItem = {
  id: string;
  content: string;
  status: string;
  priority: string;
};

type SessionInfo = {
  id: string;
  title?: string;
  slug?: string;
  status?: string;
  version?: string;
  directory?: string;
  projectId?: string;
  updatedAt: number;
};

type OfficeState = {
  agents: Map<string, any>;
  interactions: Map<string, { with: string; updatedAt: number }>;
  aliases: Map<string, string>;
  nextDeskIndex: number;
  nextAliasIndex: number;
  activeSessionId: string | null;
  lastActiveAt: number;
  loggedEventTypes: Set<string>;
  appVersion: string | null;
  lastTodoSummary: TodoSummary | null;
  todos: TodoItem[];
  sessions: Map<string, SessionInfo>;
  bossMessage: BossMessage | null;
  messageRoles: Map<string, string>;
  networkIp: string | null;
};

type EventPayload = {
  type?: string;
  source?: "opencode" | "claude";
  properties?: Record<string, any>;
};

const officeState: OfficeState = {
  agents: new Map(),
  interactions: new Map(),
  aliases: new Map(),
  nextDeskIndex: 0,
  nextAliasIndex: 1,
  activeSessionId: null,
  lastActiveAt: 0,
  loggedEventTypes: new Set(),
  appVersion: null,
  lastTodoSummary: null,
  todos: [],
  sessions: new Map(),
  bossMessage: null,
  messageRoles: new Map(),
  networkIp: null,
};

const MAX_DESKS = 15;
const DESK_COLUMNS = 5;
const IDLE_TTL_MS = 6000;

const KNOWN_EVENTS = new Set([
  "command.executed",
  "file.edited",
  "file.watcher.updated",
  "installation.updated",
  "lsp.client.diagnostics",
  "lsp.updated",
  "message.part.removed",
  "message.part.updated",
  "message.removed",
  "message.updated",
  "permission.asked",
  "permission.replied",
  "server.connected",
  "session.created",
  "session.compacted",
  "session.deleted",
  "session.diff",
  "session.error",
  "session.idle",
  "session.status",
  "session.updated",
  "todo.updated",
  "tool.execute.after",
  "tool.execute.before",
  "tui.prompt.append",
  "tui.command.execute",
  "tui.toast.show",
]);

const safeString = (value: unknown, fallback: string) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
};

const getEventType = (event: EventPayload) => safeString(event?.type, "").toLowerCase();

const logEventSummary = (event: EventPayload) => {
  const type = getEventType(event);
  const props = event?.properties || {};

  switch (type) {
    case "command.executed": {
      const command = safeString(props.command ?? "", "");
      console.log(`[PixelOffice] command.executed: ${command || "(no command)"}`);
      return;
    }
    case "file.edited":
    case "file.watcher.updated": {
      const file = safeString(props.file ?? "", "");
      console.log(`[PixelOffice] ${type}: ${file || "(no file)"}`);
      return;
    }
    case "installation.updated": {
      const version = safeString(props.version ?? "", "");
      console.log(`[PixelOffice] installation.updated: ${version || "(no version)"}`);
      return;
    }
    case "lsp.client.diagnostics": {
      const diagnostics = Array.isArray(props.diagnostics) ? props.diagnostics : [];
      console.log(`[PixelOffice] lsp.client.diagnostics: ${diagnostics.length} issues`);
      return;
    }
    case "lsp.updated": {
      const status = safeString(props.status ?? "", "");
      console.log(`[PixelOffice] lsp.updated: ${status || "(no status)"}`);
      return;
    }
    case "message.part.removed": {
      const partId = safeString(props.part?.id ?? "", "");
      console.log(`[PixelOffice] message.part.removed: ${partId || "(no part id)"}`);
      return;
    }
    case "message.part.updated": {
      const text = safeString(props.part?.text ?? "", "");
      console.log(`[PixelOffice] message.part.updated: ${text || "(no text)"}`);
      return;
    }
    case "message.removed": {
      const messageId = safeString(props.message?.id ?? "", "");
      console.log(`[PixelOffice] message.removed: ${messageId || "(no message id)"}`);
      return;
    }
    case "message.updated": {
      const text = normalizeMessageContent(props.message?.content);
      console.log(`[PixelOffice] message.updated: ${text || "(no content)"}`);
      return;
    }
    case "permission.asked":
    case "permission.replied": {
      const permission = safeString(props.permission?.action ?? "", "");
      console.log(`[PixelOffice] ${type}: ${permission || "(no permission)"}`);
      return;
    }
    case "server.connected": {
      const host = safeString(props.server?.host ?? "", "");
      console.log(`[PixelOffice] server.connected: ${host || "(no host)"}`);
      return;
    }
    case "session.created":
    case "session.compacted":
    case "session.deleted":
    case "session.diff":
    case "session.error":
    case "session.idle":
    case "session.status":
    case "session.updated": {
      if (type === "session.diff") {
        const diff = Array.isArray(props.diff) ? props.diff : [];
        if (diff.length === 0) {
          return;
        }
      }
      const sessionId = safeString(props.info?.id ?? props.sessionID ?? "", "");
      const status = safeString(props.status?.type ?? "", "");
      const suffix = status ? ` (${status})` : "";
      console.log(`[PixelOffice] ${type}: ${sessionId || "(no session)"}${suffix}`);
      return;
    }
    case "todo.updated": {
      const todos = Array.isArray(props.todos) ? props.todos : [];
      const completed = todos.filter((todo) => todo.status === "completed").length;
      console.log(`[PixelOffice] todo.updated: ${completed}/${todos.length}`);
      return;
    }
    case "tool.execute.after":
    case "tool.execute.before": {
      const toolName = safeString(props.tool?.name ?? "", "");
      console.log(`[PixelOffice] ${type}: ${toolName || "(no tool)"}`);
      return;
    }
    case "tui.prompt.append": {
      const prompt = safeString(props.prompt ?? "", "");
      console.log(`[PixelOffice] tui.prompt.append: ${prompt || "(no prompt)"}`);
      return;
    }
    case "tui.command.execute": {
      const command = safeString(props.command ?? "", "");
      console.log(`[PixelOffice] tui.command.execute: ${command || "(no command)"}`);
      return;
    }
    case "tui.toast.show": {
      const message = safeString(props.message ?? "", "");
      console.log(`[PixelOffice] tui.toast.show: ${message || "(no message)"}`);
      return;
    }
    default:
      console.log(`[PixelOffice] ${type}`);
  }
};

const normalizeMessageContent = (content: unknown) => {
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }
        if (item && typeof item.text === "string") {
          return item.text.trim();
        }
        return "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return "";
};

const extractUserMessage = (event: EventPayload) => {
  const props = event?.properties || {};
  const message = props.message || {};
  const part = props.part || {};
  const info = props.info || {};
  const eventType = getEventType(event);
  if (eventType !== "message.updated" && eventType !== "message.part.updated") {
    return null;
  }
  const role = safeString(info.role ?? message.role ?? "", "").toLowerCase();
  const roleIsUser = role === "user";
  const roleIsAssistant = role === "assistant" || role === "system";
  const messageId = safeString(
    eventType === "message.part.updated" ? part.messageID ?? "" : info.id ?? "",
    ""
  );
  if (messageId && role) {
    officeState.messageRoles.set(messageId, role);
  }
  const storedRole = messageId ? officeState.messageRoles.get(messageId) : "";
  const isUser = roleIsUser || storedRole === "user";
  if (!isUser || roleIsAssistant) {
    return null;
  }
  const text =
    eventType === "message.part.updated"
      ? safeString(part.text ?? "", "")
      : normalizeMessageContent(message.content) || safeString(message.text ?? "", "");
  if (!text) {
    return null;
  }
  const status = safeString(message.status ?? "", "");
  return { text, status };
};

const extractAgentId = (event: EventPayload) => {
  const props = event?.properties || {};
  const info = props.info || {};
  const agentName = safeString(info.agent ?? "", "");
  const sessionId = safeString(info.sessionID ?? "", "");
  if (agentName && sessionId) {
    return `${sessionId}:${agentName}`;
  }
  if (agentName) {
    return agentName;
  }
  return sessionId;
};

const extractSessionId = (event: EventPayload) => {
  const props = event?.properties || {};
  const info = props.info || {};
  const part = props.part || {};
  const eventType = getEventType(event);
  if (eventType === "session.updated" || eventType === "session.created" || eventType === "session.compacted") {
    return safeString(info.id ?? "", "");
  }
  if (
    eventType === "session.status" ||
    eventType === "session.diff" ||
    eventType === "session.idle" ||
    eventType === "session.deleted" ||
    eventType === "session.error"
  ) {
    return safeString(props.sessionID ?? "", "");
  }
  if (eventType === "message.part.updated") {
    return safeString(part.sessionID ?? "", "");
  }
  if (eventType === "file.edited" || eventType === "file.watcher.updated") {
    return safeString(props.sessionID ?? "", "");
  }
  return safeString(info.sessionID ?? "", "");
};

const isSessionOnlyOrPartEvent = (event: EventPayload) => {
  const type = getEventType(event);
  return (
    type === "session.updated" ||
    type === "session.status" ||
    type === "session.diff" ||
    type === "session.idle" ||
    type === "session.deleted" ||
    type === "session.error" ||
    type === "session.created" ||
    type === "session.compacted" ||
    type === "tui.toast.show" ||
    type === "message.part.updated"
  );
};

const resolveAgentIdsForEvent = (event: EventPayload) => {
  const props = event?.properties || {};
  const info = props.info || {};
  const sessionId = extractSessionId(event);
  const agentName = safeString(info.agent ?? "", "");
  if (!sessionId) {
    const direct = extractAgentId(event);
    return direct ? [direct] : [];
  }

  const matches = Array.from(officeState.agents.keys()).filter((key) =>
    key.startsWith(`${sessionId}:`)
  );
  if (matches.length > 0) {
    return matches;
  }

  if (isSessionOnlyOrPartEvent(event)) {
    return [];
  }

  if (agentName) {
    return [`${sessionId}:${agentName}`];
  }

  const direct = extractAgentId(event);
  return direct ? [direct] : [];
};

const isSessionOnlyEvent = (event: EventPayload) => {
  const type = getEventType(event);
  return (
    type === "session.updated" ||
    type === "session.status" ||
    type === "session.diff" ||
    type === "session.idle" ||
    type === "session.deleted" ||
    type === "session.error"
  );
};

const extractAgentName = (event: EventPayload, agentId: string) => {
  const props = event?.properties || {};
  const info = props.info || {};
  const session = props.session || {};
  const preferred = safeString(info.agent ?? session.name ?? agentId, agentId);
  if (preferred === agentId) {
    return agentId;
  }
  if (preferred.startsWith("ses_")) {
    return agentId;
  }
  if (preferred.includes("session")) {
    return agentId;
  }
  return preferred;
};

const extractAgentModel = (event: EventPayload) => {
  const props = event?.properties || {};
  const info = props.info || {};
  return safeString(info.model?.modelID ?? "unknown", "unknown");
};

const extractActiveSessionId = (event: EventPayload) => {
  const props = event?.properties || {};
  const info = props.info || {};
  const eventType = getEventType(event);
  if (
    eventType === "session.status" ||
    eventType === "session.diff" ||
    eventType === "session.idle" ||
    eventType === "session.deleted" ||
    eventType === "session.error"
  ) {
    return safeString(props.sessionID ?? "", "");
  }
  if (eventType === "session.updated" || eventType === "session.created" || eventType === "session.compacted") {
    return safeString(info.id ?? "", "");
  }
  return safeString(info.sessionID ?? "", "");
};

const applySessionLifecycle = (event: EventPayload) => {
  const type = getEventType(event);
  if (type === "session.deleted") {
    const props = event?.properties || {};
    const sessionId = safeString(props.sessionID ?? "", "");
    if (sessionId) {
      officeState.sessions.delete(sessionId);
      for (const key of officeState.agents.keys()) {
        if (key.startsWith(`${sessionId}:`) || key === sessionId) {
          officeState.agents.delete(key);
          officeState.aliases.delete(key);
          officeState.interactions.delete(key);
        }
      }
      if (officeState.activeSessionId === sessionId) {
        officeState.activeSessionId = null;
      }
    }
  }

  if (type === "session.idle") {
    const agentIds = resolveAgentIdsForEvent(event);
    agentIds.forEach((agentId) => {
      if (officeState.agents.has(agentId)) {
        const existing = officeState.agents.get(agentId);
        officeState.agents.set(agentId, {
          ...existing,
          status: "idle",
          updatedAt: Date.now(),
        });
      }
    });
  }
};

const getAlias = (agentId: string, preferredName: string) => {
  if (preferredName && preferredName !== agentId) {
    officeState.aliases.set(agentId, preferredName);
  }
  if (!officeState.aliases.has(agentId)) {
    officeState.aliases.set(agentId, `Agent ${officeState.nextAliasIndex}`);
    officeState.nextAliasIndex += 1;
  }
  return officeState.aliases.get(agentId);
};

const mapStatusFromEvent = (event: EventPayload) => {
  const type = getEventType(event);
  const status = safeString(event?.properties?.status ?? "", "").toLowerCase();

  if (status) {
    return status;
  }
  if (type === "session.error") {
    return "error";
  }
  if (type === "tool.execute.before") {
    return "working";
  }
  if (type === "tool.execute.after") {
    return "thinking";
  }
  if (type.startsWith("message.")) {
    return "thinking";
  }
  if (type === "session.idle") {
    return "idle";
  }
  if (type === "session.created") {
    return "idle";
  }
  if (type === "session.status") {
    return "working";
  }
  if (type === "session.compacted") {
    return "planning";
  }
  return "working";
};

const extractParentId = (event: EventPayload) => {
  const props = event?.properties || {};
  return safeString(props.parentSessionId ?? "", "");
};

const extractSessionInfo = (event: EventPayload) => {
  const props = event?.properties || {};
  const info = props.info || {};
  const eventType = getEventType(event);
  if (
    eventType !== "session.updated" &&
    eventType !== "session.created" &&
    eventType !== "session.compacted"
  ) {
    return null;
  }
  const sessionId = safeString(info.id ?? "", "");
  if (!sessionId) {
    return null;
  }
  return {
    id: sessionId,
    title: safeString(info.title ?? "", ""),
    slug: safeString(info.slug ?? "", ""),
    status: "",
    version: safeString(info.version ?? "", ""),
    directory: safeString(info.directory ?? "", ""),
    projectId: safeString(info.projectID ?? "", ""),
    updatedAt: Date.now(),
  };
};

const upsertSession = (event: EventPayload) => {
  const info = extractSessionInfo(event);
  if (!info) {
    return;
  }
  const existing = officeState.sessions.get(info.id);
  const nextInfo = existing
    ? {
      ...existing,
      ...info,
      updatedAt: Date.now(),
    }
    : info;
  officeState.sessions.set(info.id, nextInfo);
};

const updateSessionStatus = (event: EventPayload) => {
  const eventType = getEventType(event);
  if (eventType !== "session.status") {
    return;
  }
  const props = event?.properties || {};
  const sessionId = safeString(props.sessionID ?? "", "");
  if (!sessionId) {
    return;
  }
  const status = safeString(props.status?.type ?? "", "");
  const existing = officeState.sessions.get(sessionId);
  const nextInfo = existing
    ? {
      ...existing,
      status,
      updatedAt: Date.now(),
    }
    : {
      id: sessionId,
      status,
      updatedAt: Date.now(),
    };
  officeState.sessions.set(sessionId, nextInfo);
};

const assignDesk = () => {
  const deskIndex = officeState.nextDeskIndex % MAX_DESKS;
  officeState.nextDeskIndex += 1;
  return {
    deskIndex,
    row: Math.floor(deskIndex / DESK_COLUMNS),
    column: deskIndex % DESK_COLUMNS,
  };
};

const extractSessionTitle = (event: EventPayload) => {
  const info = event?.properties?.info || {};
  return safeString(info.title ?? "", "");
};

const isBackgroundSession = (title: string) =>
  Boolean(title) &&
  (title.toLowerCase().includes("subagent") ||
    title.toLowerCase().includes("looker") ||
    title.toLowerCase().includes("multimodal"));

const pruneAgents = () => {
  const now = Date.now();
  for (const [key, agent] of officeState.agents.entries()) {
    const lastActivity = agent.lastActivityAt || agent.lastMessageAt || 0;
    if (!agent.isBackground && agent.status !== "idle" && lastActivity) {
      if (now - lastActivity > IDLE_TTL_MS) {
        officeState.agents.set(key, {
          ...agent,
          status: "idle",
          updatedAt: now,
        });
      }
    }
    if (
      agent.isBackground &&
      agent.status !== "idle" &&
      agent.status !== "error" &&
      agent.lastActivityAt &&
      now - agent.lastActivityAt > 4000
    ) {
      officeState.agents.set(key, {
        ...agent,
        status: "idle",
        updatedAt: now,
      });
    }
    if (
      agent.isBackground &&
      agent.status === "idle" &&
      now - agent.updatedAt > 3000
    ) {
      officeState.agents.delete(key);
      officeState.aliases.delete(key);
      officeState.interactions.delete(key);
    }
  }
};

const setInteraction = (fromId: string, toId: string) => {
  if (!fromId || !toId || fromId === toId) {
    return;
  }
  officeState.interactions.set(fromId, {
    with: toId,
    updatedAt: Date.now(),
  });
};

const pruneInteractions = () => {
  const now = Date.now();
  for (const [key, value] of officeState.interactions.entries()) {
    if (now - value.updatedAt > 15_000) {
      officeState.interactions.delete(key);
    }
  }
};

const upsertAgentFromEvent = (event: EventPayload) => {
  const agentIds = resolveAgentIdsForEvent(event);
  const targetIds = isSessionOnlyOrPartEvent(event)
    ? agentIds
    : agentIds.length > 0
      ? agentIds
      : [extractAgentId(event)];
  const cleanedIds = targetIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
  if (cleanedIds.length === 0) {
    return null;
  }
  if (isSessionOnlyOrPartEvent(event)) {
    const hasAgentMatch = cleanedIds.some((id) => officeState.agents.has(id));
    if (!hasAgentMatch) {
      return null;
    }
  }
  const props = event?.properties || {};
  const part = props.part || {};
  const partText = safeString(part.text, "");
  const partContent = safeString(part.content, "");
  const partDelta = safeString(part.delta, "");
  const messageSnippet = partText || partContent || partDelta;
  const status = mapStatusFromEvent(event);
  const model = extractAgentModel(event);
  const provider = safeString(event?.properties?.info?.model?.providerID, "");
  const modelId = safeString(event?.properties?.info?.model?.modelID, "");
  const rawSessionId = extractSessionId(event);
  const sessionTitle = extractSessionTitle(event);
  const updatedAt = Date.now();
  const eventType = getEventType(event);
  const eventSource = event?.source || "opencode";
  const isPartUpdate = eventType === "message.part.updated";
  const messageId = isPartUpdate
    ? safeString(part.messageID ?? "", "")
    : safeString(props.info?.id ?? "", "");
  const messageRole = messageId ? officeState.messageRoles.get(messageId) : "";
  const isUserMessage = messageRole === "user";
  let primaryId = cleanedIds[0];

  cleanedIds.forEach((agentId) => {
    const existing = officeState.agents.get(agentId);
    const name = isSessionOnlyOrPartEvent(event)
      ? existing?.name || agentId
      : extractAgentName(event, agentId);
    const alias = getAlias(agentId, name);
    const resolvedModel = modelId || model;
    const nextModel =
      resolvedModel !== "unknown"
        ? resolvedModel
        : existing?.model || "unknown";
    const nextProvider = provider || existing?.provider || "";
    const nextSessionId = rawSessionId || existing?.sessionId || "";
    const nextSessionTitle = sessionTitle || existing?.sessionTitle || "";
    const nextIsBackground = isBackgroundSession(nextSessionTitle);

    const nextMessageSnippet = isUserMessage
      ? existing?.lastMessageSnippet || ""
      : isPartUpdate && !partText && !partContent && partDelta
        ? `${existing?.lastMessageSnippet || ""}${partDelta}`
        : messageSnippet || existing?.lastMessageSnippet || "";
    const trimmedSnippet =
      nextMessageSnippet.length > 400
        ? nextMessageSnippet.slice(-400)
        : nextMessageSnippet;
    const hasMessageUpdate = !isUserMessage && Boolean(messageSnippet);
    const now = Date.now();
    const isFileEditEvent = eventType === "file.edited" || eventType === "file.watcher.updated";
    const isActivityEvent =
      eventType === "tool.execute.before" ||
      isFileEditEvent ||
      isPartUpdate ||
      (eventType === "message.updated" && hasMessageUpdate);
    const nextMessageAt = hasMessageUpdate
      ? now
      : existing?.lastMessageAt || 0;
    const nextStreamingAt = isPartUpdate && hasMessageUpdate
      ? now
      : existing?.lastStreamingAt || 0;
    const nextActivityAt = isActivityEvent
      ? now
      : existing?.lastActivityAt || 0;
    const nextStatus =
      existing?.status === "idle" && !isActivityEvent && status !== "error"
        ? "idle"
        : status;

    if (existing) {
      officeState.agents.set(agentId, {
        ...existing,
        name,
        alias,
        model: nextModel,
        provider: nextProvider,
        sessionId: nextSessionId,
        sessionTitle: nextSessionTitle,
        isBackground: nextIsBackground,
        status: nextStatus,
        source: existing.source || eventSource,
        lastEventType: event?.type || existing.lastEventType,
        lastMessageSnippet: trimmedSnippet,
        lastMessageAt: nextMessageAt,
        lastStreamingAt: nextStreamingAt,
        lastActivityAt: nextActivityAt,
        lastStatusType: props.status?.type || existing.lastStatusType || "",
        lastEventAt: now,
        lastDiffAt: eventType === "session.diff" ? Date.now() : existing.lastDiffAt,
        lastFileEdited: props.file || existing.lastFileEdited || "",
        lastFileEditAt: isFileEditEvent ? Date.now() : existing.lastFileEditAt,
        updatedAt,
      });
    } else {
      officeState.agents.set(agentId, {
        id: agentId,
        name,
        alias,
        model: nextModel,
        provider: nextProvider,
        sessionId: nextSessionId,
        sessionTitle: nextSessionTitle,
        isBackground: nextIsBackground,
        status,
        source: eventSource,
        lastEventType: event?.type || "unknown",
        lastMessageSnippet: trimmedSnippet,
        lastMessageAt: hasMessageUpdate ? Date.now() : 0,
        lastStreamingAt: isPartUpdate && hasMessageUpdate ? Date.now() : 0,
        lastActivityAt: isActivityEvent ? Date.now() : 0,
        lastStatusType: props.status?.type || "",
        lastEventAt: now,
        lastDiffAt: eventType === "session.diff" ? Date.now() : 0,
        lastFileEdited: props.file || "",
        lastFileEditAt: isFileEditEvent ? Date.now() : 0,
        updatedAt,
        desk: assignDesk(),
      });
    }
  });

  return primaryId;
};

const updateBossMessage = (event: EventPayload) => {
  const userMessage = extractUserMessage(event);
  if (!userMessage) {
    return;
  }
  officeState.bossMessage = {
    ...userMessage,
    updatedAt: Date.now(),
  };
};

const getStateSnapshot = () => {
  pruneInteractions();
  pruneAgents();
  return {
    agents: Array.from(officeState.agents.values()),
    sessions: Array.from(officeState.sessions.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt
    ),
    todos: officeState.todos,
    activeSessionId: officeState.activeSessionId,
    appVersion: officeState.appVersion,
    lastTodoSummary: officeState.lastTodoSummary,
    interactions: Array.from(officeState.interactions.entries()).map(
      ([from, info]) => ({
        from,
        to: info.with,
        updatedAt: info.updatedAt,
      })
    ),
    bossMessage: officeState.bossMessage,
    networkIp: officeState.networkIp,
    updatedAt: Date.now(),
  };
};

const broadcast = (payload: unknown) => {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
};

app.post("/events", (req: any, res: any) => {
  const event = req.body as EventPayload;
  const eventType = getEventType(event) || "unknown";
  // console.log(`[PixelOffice] Event received: ${eventType}`);
  if (!officeState.loggedEventTypes.has(eventType)) {
    officeState.loggedEventTypes.add(eventType);
  }
  if (!KNOWN_EVENTS.has(eventType)) {
    res.status(202).json({ ok: true });
    return;
  }
  logEventSummary(event);

  if (eventType === "installation.updated") {
    const nextVersion = safeString(event?.properties?.version ?? "", "");
    officeState.appVersion = nextVersion || null;
  }

  if (eventType === "session.diff") {
    const diff = Array.isArray(event?.properties?.diff)
      ? event.properties.diff
      : [];
    if (diff.length === 0) {
      res.status(202).json({ ok: true });
      return;
    }
  }

  if (eventType === "todo.updated") {
    const todos = Array.isArray(event?.properties?.todos)
      ? event.properties.todos
      : [];
    const completed = todos.filter((todo) => todo.status === "completed").length;
    const updatedAt = Date.now();
    if (todos.length > 0 && completed === todos.length) {
      officeState.lastTodoSummary = {
        total: 0,
        completed: 0,
        updatedAt,
      };
      officeState.todos = [];
    } else {
      officeState.lastTodoSummary = {
        total: todos.length,
        completed,
        updatedAt,
      };
      officeState.todos = todos.map((todo) => ({
        id: safeString(todo.id, ""),
        content: safeString(todo.content, ""),
        status: safeString(todo.status, ""),
        priority: safeString(todo.priority, ""),
      }));
    }
  }
  const activeSessionId = extractActiveSessionId(event);
  if (activeSessionId) {
    officeState.activeSessionId = activeSessionId;
    officeState.lastActiveAt = Date.now();
  }

  upsertSession(event);
  updateSessionStatus(event);

  applySessionLifecycle(event);
  const agentId = upsertAgentFromEvent(event);
  updateBossMessage(event);
  const parentId = extractParentId(event);
  if (agentId && parentId) {
    setInteraction(parentId, agentId);
  }

  broadcast({ type: "event", event });
  broadcast({ type: "state", state: getStateSnapshot() });
  res.status(202).json({ ok: true });
});

app.get("/health", (_req: any, res: any) => {
  res.json({ ok: true });
});

wss.on("connection", (socket: any) => {
  socket.send(JSON.stringify({ type: "state", state: getStateSnapshot() }));
});

const getLocalIp = () => {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
};

server.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIp();
  officeState.networkIp = ip;
  console.log(`Pixel Office Server Running:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${ip}:${PORT}`);
});
