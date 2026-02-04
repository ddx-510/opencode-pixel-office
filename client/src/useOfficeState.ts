import { useEffect, useMemo, useState } from "react";

type Agent = {
  id: string;
  name?: string;
  alias?: string;
  model?: string;
  provider?: string;
  status?: string;
  lastMessageSnippet?: string;
  lastMessageAt?: number;
  lastStreamingAt?: number;
  lastActivityAt?: number;
  lastEventAt?: number;
  lastEventType?: string;
  lastDiffAt?: number;
  lastFileEdited?: string;
  lastFileEditAt?: number;
  sessionId?: string;
  desk?: {
    row?: number;
    column?: number;
    deskIndex?: number;
  };
  role?: string;
};

type Interaction = {
  from: string;
  to: string;
  updatedAt: number;
};

type TodoSummary = {
  total: number;
  completed: number;
  updatedAt: number;
};

type BossMessage = {
  text?: string;
  status?: string;
  updatedAt?: number;
};

type TodoItem = {
  id?: string;
  content?: string;
  status?: string;
  priority?: string;
};

type SessionInfo = {
  id: string;
  title?: string;
  slug?: string;
  status?: string;
  version?: string;
  directory?: string;
  projectId?: string;
  updatedAt?: number;
};

type OfficeStatePayload = {
  agents?: Agent[];
  sessions?: SessionInfo[];
  todos?: TodoItem[];
  interactions?: Interaction[];
  activeSessionId?: string | null;
  updatedAt?: number;
  appVersion?: string | null;
  lastTodoSummary?: TodoSummary | null;
  bossMessage?: BossMessage | null;
};

const createSocketUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
};

export const useOfficeState = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [lastTodoSummary, setLastTodoSummary] = useState<TodoSummary | null>(null);
  const [bossMessage, setBossMessage] = useState<BossMessage | null>(null);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      socket = new WebSocket(createSocketUrl());

      socket.addEventListener("open", () => setConnected(true));
      socket.addEventListener("close", () => {
        setConnected(false);
        reconnectTimer = window.setTimeout(connect, 2000);
      });

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            type: string;
            state?: OfficeStatePayload;
          };
          if (payload.type === "state" && payload.state) {
            const nextState = payload.state;
            setAgents(nextState.agents || []);
            setSessions(nextState.sessions || []);
            setTodos(nextState.todos || []);
            setInteractions(nextState.interactions || []);
            setActiveSessionId(nextState.activeSessionId || null);
            setAppVersion(nextState.appVersion || null);
            setLastTodoSummary(nextState.lastTodoSummary || null);
            setBossMessage(nextState.bossMessage || null);
            if (nextState.activeSessionId) {
              const nextActive = nextState.activeSessionId ?? null;
              setSelectedSessionId((current) => current ?? nextActive);
            }
          }
        } catch (error) {
          console.error("Failed to parse websocket message", error);
        }
      });
    };

    connect();

    return () => {
      if (socket) {
        socket.close();
      }
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedAgentId) {
      const stillExists = agents.some((agent) => agent.id === selectedAgentId);
      if (!stillExists) {
        setSelectedAgentId(null);
      }
    }
  }, [agents, selectedAgentId]);

  useEffect(() => {
    if (selectedSessionId) {
      const stillExists = sessions.some(
        (session) => session.id === selectedSessionId
      );
      if (!stillExists) {
        setSelectedSessionId(null);
      }
    }
  }, [sessions, selectedSessionId]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) || null,
    [agents, selectedAgentId]
  );

  return {
    agents,
    sessions,
    todos,
    interactions,
    connected,
    activeSessionId,
    selectedSessionId,
    selectedAgentId,
    selectedSession,
    selectedAgent,
    appVersion,
    lastTodoSummary,
    bossMessage,
    setSelectedAgentId,
    setSelectedSessionId,
  };
};

export type { Agent, Interaction, SessionInfo, TodoItem, TodoSummary, BossMessage };
