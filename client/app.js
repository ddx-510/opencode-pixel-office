const canvas = document.querySelector("#officeCanvas");
const statusEl = document.querySelector("#connectionStatus");
const agentDetailEl = document.querySelector("#agentDetail");
const sessionPanelEl = document.querySelector("#sessionPanel");

const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const state = {
  agents: [],
  interactions: [],
  connected: false,
  updatedAt: 0,
  activeSessionId: null,
  selectedAgentId: null,
  appVersion: null,
  lastTodoSummary: null,
};

const agentSprites = new Map();

const TILE = 30;
const MAP_COLS = Math.floor(canvas.width / TILE);
const MAP_ROWS = Math.floor(canvas.height / TILE);

const COLORS = {
  grass: "#7dbb5a",
  grassShadow: "#6aa34d",
  path: "#d8c28a",
  pathShadow: "#c2ad77",
  floor: "#b8a070",
  floorShadow: "#a08b62",
  wall: "#6f5d3f",
  wallShadow: "#5c4c35",
  desk: "#6f4f3c",
  deskShadow: "#5e3f2e",
  window: "#7cc0d9",
  hud: "#1d2c52",
  hudBorder: "#4b73a6",
  hudInset: "#0f1b36",
  text: "#f8f3d4",
  shadow: "#1b1e2b",
  idle: "#7ba7a0",
  thinking: "#f7c36f",
  working: "#4cb2f2",
  planning: "#b68cff",
  error: "#ff6b6b",
  link: "#8af0a5",
};

const STATUS_COLORS = {
  idle: COLORS.idle,
  thinking: COLORS.thinking,
  working: COLORS.working,
  planning: COLORS.planning,
  error: COLORS.error,
};

const AVATAR_COLORS = [
  "#f2a271",
  "#7bdff2",
  "#b9f18c",
  "#f5e960",
  "#b38df4",
  "#f28ca2",
  "#8cc5ff",
  "#f7b978",
];

const OFFICE_AREA = {
  colStart: 4,
  colEnd: 27,
  rowStart: 2,
  rowEnd: 11,
};

const MESSAGE_TTL_MS = 3000;
const TYPING_TTL_MS = 800;

const DESK_LAYOUT = {
  rows: 3,
  cols: 5,
  origin: { col: 7, row: 4 },
  colStep: 4,
  rowStep: 3,
};

const tileKey = (col, row) => `${col},${row}`;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const toColor = (status) => STATUS_COLORS[status] || COLORS.working;

const drawRoundedRect = (context, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
};

const formatSnippet = (snippet, maxLength) => {
  if (!snippet) {
    return "";
  }
  if (snippet.length <= maxLength) {
    return snippet;
  }
  return `...${snippet.slice(-maxLength)}`;
};

const updateStatus = (connected) => {
  statusEl.textContent = connected ? "Live" : "Disconnected";
  statusEl.classList.toggle("online", connected);
};

const connect = () => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${protocol}://${window.location.host}`;
  const socket = new WebSocket(wsUrl);

  socket.addEventListener("open", () => {
    state.connected = true;
    updateStatus(true);
  });

  socket.addEventListener("close", () => {
    state.connected = false;
    updateStatus(false);
    setTimeout(connect, 2000);
  });

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "state" && payload.state) {
        state.agents = payload.state.agents || [];
        state.interactions = payload.state.interactions || [];
        state.updatedAt = payload.state.updatedAt || Date.now();
        state.activeSessionId = payload.state.activeSessionId || null;
        state.appVersion = payload.state.appVersion || null;
        state.lastTodoSummary = payload.state.lastTodoSummary || null;
        if (state.selectedAgentId) {
          const stillExists = state.agents.some(
            (agent) => agent.id === state.selectedAgentId
          );
          if (!stillExists) {
            state.selectedAgentId = null;
          }
        }
        renderSessionPanel();
        renderAgentDetail();
      }
    } catch (error) {
      console.error("Failed to parse websocket message", error);
    }
  });
};

const renderSessionPanel = () => {
  const activeLabel = state.activeSessionId
    ? state.activeSessionId.slice(0, 10)
    : "none";
  const version = state.appVersion ? `v${state.appVersion}` : "unknown";
  const todos = state.lastTodoSummary
    ? `${state.lastTodoSummary.completed}/${state.lastTodoSummary.total}`
    : "0/0";

  sessionPanelEl.innerHTML = `
    <span>Session: ${activeLabel}</span>
    <span>Version: ${version}</span>
    <span>Todos: ${todos}</span>
  `;
};

const buildDeskTiles = () => {
  const tiles = [];
  let index = 0;
  for (let row = 0; row < DESK_LAYOUT.rows; row += 1) {
    for (let col = 0; col < DESK_LAYOUT.cols; col += 1) {
      tiles.push({
        row: DESK_LAYOUT.origin.row + row * DESK_LAYOUT.rowStep,
        col: DESK_LAYOUT.origin.col + col * DESK_LAYOUT.colStep,
        index,
      });
      index += 1;
    }
  }
  return tiles;
};

const deskTiles = buildDeskTiles();
const blockedTiles = new Set();
const walkableTiles = [];

const buildTileMap = () => {
  const map = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => "grass")
  );

  for (let row = OFFICE_AREA.rowStart; row <= OFFICE_AREA.rowEnd; row += 1) {
    for (let col = OFFICE_AREA.colStart; col <= OFFICE_AREA.colEnd; col += 1) {
      map[row][col] = "floor";
    }
  }

  for (let col = OFFICE_AREA.colStart; col <= OFFICE_AREA.colEnd; col += 1) {
    map[OFFICE_AREA.rowStart][col] = "wall";
    map[OFFICE_AREA.rowEnd][col] = "wall";
  }

  for (let row = OFFICE_AREA.rowStart; row <= OFFICE_AREA.rowEnd; row += 1) {
    map[row][OFFICE_AREA.colStart] = "wall";
    map[row][OFFICE_AREA.colEnd] = "wall";
  }

  const doorCol = Math.floor((OFFICE_AREA.colStart + OFFICE_AREA.colEnd) / 2);
  map[OFFICE_AREA.rowEnd][doorCol] = "floor";

  for (let row = OFFICE_AREA.rowEnd + 1; row < MAP_ROWS; row += 1) {
    for (let col = doorCol - 1; col <= doorCol + 1; col += 1) {
      if (col >= 0 && col < MAP_COLS) {
        map[row][col] = "path";
      }
    }
  }

  for (let col = OFFICE_AREA.colStart + 2; col < OFFICE_AREA.colEnd; col += 4) {
    map[OFFICE_AREA.rowStart][col] = "window";
  }

  deskTiles.forEach((tile) => {
    map[tile.row][tile.col] = "desk";
  });

  return map;
};

const tileMap = buildTileMap();

const isWalkable = (col, row) => {
  if (col < 0 || row < 0 || col >= MAP_COLS || row >= MAP_ROWS) {
    return false;
  }
  const type = tileMap[row][col];
  return type === "grass" || type === "floor" || type === "path";
};

for (let row = 0; row < MAP_ROWS; row += 1) {
  for (let col = 0; col < MAP_COLS; col += 1) {
    if (isWalkable(col, row)) {
      walkableTiles.push({ col, row });
    } else {
      blockedTiles.add(tileKey(col, row));
    }
  }
}

const tileToPixel = (tile) => ({
  x: tile.col * TILE + TILE / 2,
  y: tile.row * TILE + TILE / 2,
});

const deskTileForAgent = (agent) => {
  const row = agent?.desk?.row ?? 0;
  const col = agent?.desk?.column ?? 0;
  const index = row * DESK_LAYOUT.cols + col;
  return deskTiles[index % deskTiles.length] || deskTiles[0];
};

const pickRandomWalkable = () =>
  walkableTiles[Math.floor(Math.random() * walkableTiles.length)];

const pickWanderTile = (homeTile, radius) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const row = clamp(
      homeTile.row + Math.floor(Math.random() * (radius * 2 + 1)) - radius,
      1,
      MAP_ROWS - 2
    );
    const col = clamp(
      homeTile.col + Math.floor(Math.random() * (radius * 2 + 1)) - radius,
      1,
      MAP_COLS - 2
    );
    if (isWalkable(col, row)) {
      return { row, col };
    }
  }
  return pickRandomWalkable();
};

const ensureSprite = (agent) => {
  const existing = agentSprites.get(agent.id);
  if (existing) {
    return existing;
  }
  const homeTile = deskTileForAgent(agent) || pickRandomWalkable();
  const position = tileToPixel(homeTile);
  const sprite = {
    id: agent.id,
    x: position.x,
    y: position.y,
    targetX: position.x,
    targetY: position.y,
    homeTile,
    homeKey: tileKey(homeTile.col, homeTile.row),
  };
  agentSprites.set(agent.id, sprite);
  return sprite;
};

const syncSprites = () => {
  const ids = new Set(state.agents.map((agent) => agent.id));
  for (const id of agentSprites.keys()) {
    if (!ids.has(id)) {
      agentSprites.delete(id);
    }
  }
  state.agents.forEach((agent) => {
    const sprite = ensureSprite(agent);
    const deskTile = deskTileForAgent(agent);
    if (deskTile) {
      const key = tileKey(deskTile.col, deskTile.row);
      if (key !== sprite.homeKey) {
        sprite.homeTile = deskTile;
        sprite.homeKey = key;
      }
    }
  });
};

const statusSpeed = (status) => {
  switch (status) {
    case "idle":
      return 0.35;
    case "thinking":
      return 0.45;
    case "planning":
      return 0.4;
    case "error":
      return 0.25;
    case "working":
    default:
      return 0.55;
  }
};

const statusRadius = (status) => {
  switch (status) {
    case "working":
      return 0;
    case "idle":
      return 2;
    case "thinking":
      return 3;
    case "planning":
      return 4;
    case "error":
      return 1;
    default:
      return 2;
  }
};

const shouldBeAtDesk = (status) =>
  status === "working" || status === "planning";

const updateSprite = (sprite, agent) => {
  const dx = sprite.targetX - sprite.x;
  const dy = sprite.targetY - sprite.y;
  const distance = Math.hypot(dx, dy);
  const speed = statusSpeed(agent.status);

  if (distance < 1) {
    if (shouldBeAtDesk(agent.status)) {
      const deskTarget = tileToPixel(sprite.homeTile);
      sprite.targetX = deskTarget.x;
      sprite.targetY = deskTarget.y;
    } else {
      const radius = statusRadius(agent.status);
      const targetTile = pickWanderTile(sprite.homeTile, radius);
      const target = tileToPixel(targetTile);
      sprite.targetX = target.x;
      sprite.targetY = target.y;
    }
  } else {
    const step = Math.min(speed, distance);
    sprite.x += (dx / distance) * step;
    sprite.y += (dy / distance) * step;
  }
};

const drawTile = (col, row, type) => {
  const x = col * TILE;
  const y = row * TILE;

  switch (type) {
    case "grass":
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = COLORS.grassShadow;
      ctx.fillRect(x, y + TILE - 6, TILE, 6);
      break;
    case "path":
      ctx.fillStyle = COLORS.path;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = COLORS.pathShadow;
      ctx.fillRect(x, y + TILE - 5, TILE, 5);
      break;
    case "floor":
      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = COLORS.floorShadow;
      ctx.fillRect(x, y + TILE - 6, TILE, 6);
      break;
    case "wall":
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = COLORS.wallShadow;
      ctx.fillRect(x, y + TILE - 8, TILE, 8);
      break;
    case "window":
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = COLORS.window;
      ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12);
      break;
    case "desk":
      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = COLORS.desk;
      ctx.fillRect(x + 4, y + 10, TILE - 8, TILE - 12);
      ctx.fillStyle = COLORS.deskShadow;
      ctx.fillRect(x + 4, y + TILE - 8, TILE - 8, 6);
      break;
    default:
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(x, y, TILE, TILE);
  }
};

const drawMap = () => {
  for (let row = 0; row < MAP_ROWS; row += 1) {
    for (let col = 0; col < MAP_COLS; col += 1) {
      drawTile(col, row, tileMap[row][col]);
    }
  }
};

const drawHud = () => {
  ctx.fillStyle = COLORS.hud;
  ctx.fillRect(20, 16, 180, 34);
  ctx.strokeStyle = COLORS.hudBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 16, 180, 34);
  ctx.strokeStyle = COLORS.hudInset;
  ctx.strokeRect(24, 20, 172, 26);

  ctx.fillStyle = COLORS.text;
  ctx.font = "12px 'Courier New', monospace";
  ctx.fillText("OpenCode Office", 34, 38);
};

const formatLabel = (agent) => {
  const alias = agent.alias || agent.name || agent.id || "Agent";
  const model = agent.model && agent.model !== "unknown" ? agent.model : "";
  if (!model) {
    return alias;
  }
  return `${alias} ${model}`;
};

const renderAgentDetail = () => {
  const agent = state.agents.find((item) => item.id === state.selectedAgentId);
  if (!agent) {
    agentDetailEl.innerHTML = "<p>Select an agent</p>";
    return;
  }

  const modelLabel = agent.model || "unknown";
  const provider = agent.provider || "";
  const snippet = agent.lastMessageSnippet || "";
  const sessionLabel = agent.sessionId || agent.id;
  agentDetailEl.innerHTML = `
    <div class="agent-header">
      <span class="chip chip-agent">${agent.alias || agent.name || "Agent"}</span>
      <span class="chip chip-model">${modelLabel}</span>
    </div>
    <span>Status: ${agent.status}</span>
    ${provider ? `<span>Provider: ${provider}</span>` : ""}
    ${snippet ? `<span>Last: ${snippet.slice(0, 42)}</span>` : ""}
    <span>Session: ${sessionLabel}</span>
  `;
};

const pickAvatarColor = (agent) => {
  const id = agent.id || "";
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 997;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const pickAvatarStyle = (agent) => {
  const id = agent.id || "";
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 17 + id.charCodeAt(i)) % 991;
  }
  return hash % 4;
};

const statusBubbleText = (status) => {
  switch (status) {
    case "idle":
      return "idle";
    case "thinking":
      return "thinking";
    case "planning":
      return "planning";
    case "working":
      return "working";
    case "error":
      return "error";
    default:
      return "working";
  }
};

const drawAgent = (agent, sprite, time) => {
  const x = sprite.x - 8;
  const y = sprite.y - 12;
  const bob = Math.sin(time / 260 + sprite.x) * 1.5;
  const bodyColor = pickAvatarColor(agent);
  const style = pickAvatarStyle(agent);

  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(x + 2, y + 18, 12, 4);

  ctx.fillStyle = bodyColor;
  ctx.fillRect(x, y + bob, 16, 14);
  ctx.fillRect(x + 2, y - 6 + bob, 12, 8);

  if (style === 0) {
    ctx.fillStyle = "#2b3f5c";
    ctx.fillRect(x + 2, y - 10 + bob, 12, 4);
  }
  if (style === 1) {
    ctx.fillStyle = "#2d2a27";
    ctx.fillRect(x + 2, y - 8 + bob, 12, 2);
    ctx.fillRect(x + 4, y - 10 + bob, 8, 2);
  }
  if (style === 2) {
    ctx.fillStyle = "#6b4f2d";
    ctx.fillRect(x + 2, y - 8 + bob, 12, 2);
  }
  if (style === 3) {
    ctx.fillStyle = "#5c2f6e";
    ctx.fillRect(x + 2, y - 12 + bob, 12, 4);
    ctx.fillRect(x + 5, y - 14 + bob, 6, 2);
  }

  ctx.fillStyle = "#13131a";
  ctx.fillRect(x + 4, y - 2 + bob, 2, 2);
  ctx.fillRect(x + 10, y - 2 + bob, 2, 2);

  ctx.fillStyle = "#e8f6ff";
  ctx.fillRect(x + 12, y + 10 + bob, 8, 6);
  ctx.fillStyle = "#2b3f5c";
  ctx.fillRect(x + 13, y + 11 + bob, 6, 4);

  ctx.fillStyle = COLORS.text;
  ctx.font = "10px 'Courier New', monospace";
  const label = formatLabel(agent).slice(0, 14);
  ctx.fillText(label, x - 10, y - 10 + bob);

  const statusText = statusBubbleText(agent.status);
  const bubbleX = x - 8;
  const bubbleY = y - 32 + bob;
  ctx.fillStyle = "#f5f1cf";
  ctx.fillRect(bubbleX, bubbleY, 60, 16);
  ctx.strokeStyle = "#2b3f5c";
  ctx.strokeRect(bubbleX, bubbleY, 60, 16);
  ctx.fillStyle = "#2b3f5c";
  ctx.font = "10px 'Courier New', monospace";
  ctx.fillText(statusText, bubbleX + 6, bubbleY + 11);

  const isMessageFresh =
    agent.lastMessageAt && Date.now() - agent.lastMessageAt < MESSAGE_TTL_MS;
  const isStreaming =
    agent.lastStreamingAt && Date.now() - agent.lastStreamingAt < TYPING_TTL_MS;
  if (agent.lastMessageSnippet && isMessageFresh) {
    const replyBubbleX = x - 22;
    const replyBubbleY = y - 56 + bob;
    const bubbleWidth = 96;
    const bubbleHeight = 18;
    ctx.fillStyle = "#f1fff3";
    drawRoundedRect(ctx, replyBubbleX, replyBubbleY, bubbleWidth, bubbleHeight, 4);
    ctx.fill();
    ctx.strokeStyle = "#3a5b3c";
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, replyBubbleX, replyBubbleY, bubbleWidth, bubbleHeight, 4);
    ctx.stroke();
    ctx.fillStyle = "#3a5b3c";
    ctx.font = "9px 'Courier New', monospace";
    if (isStreaming) {
      const phase = Math.floor(time / 250) % 4;
      const dots = ".".repeat(Math.max(1, phase));
      ctx.fillText(dots, replyBubbleX + 6, replyBubbleY + 12);
    } else {
      const snippet = formatSnippet(agent.lastMessageSnippet, 14);
      ctx.fillText(snippet, replyBubbleX + 6, replyBubbleY + 12);
    }
    ctx.lineWidth = 1;
  }

  if (agent.lastDiffAt && Date.now() - agent.lastDiffAt < 2000) {
    const iconX = x + 18;
    const iconY = y + 6 + bob;
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(iconX, iconY, 6, 6);
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(iconX + 2, iconY + 1, 2, 4);
  }

  if (agent.lastFileEditAt && Date.now() - agent.lastFileEditAt < 2500) {
    const iconX = x - 18;
    const iconY = y + 6 + bob;
    ctx.fillStyle = "#a7f3d0";
    ctx.fillRect(iconX, iconY, 6, 6);
    ctx.fillStyle = "#2f6b4f";
    ctx.fillRect(iconX + 1, iconY + 1, 4, 4);
  }
};

const drawInteractions = () => {
  ctx.strokeStyle = COLORS.link;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  state.interactions.forEach((interaction) => {
    const fromSprite = agentSprites.get(interaction.from);
    const toSprite = agentSprites.get(interaction.to);
    if (!fromSprite || !toSprite) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(fromSprite.x, fromSprite.y - 8);
    ctx.lineTo(toSprite.x, toSprite.y - 8);
    ctx.stroke();
  });
  ctx.setLineDash([]);
};

const getAgentAtPoint = (x, y) => {
  for (const agent of state.agents) {
    const sprite = agentSprites.get(agent.id);
    if (!sprite) {
      continue;
    }
    const dx = Math.abs(sprite.x - x);
    const dy = Math.abs(sprite.y - y);
    if (dx <= 10 && dy <= 12) {
      return agent;
    }
  }
  return null;
};

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const agent = getAgentAtPoint(x, y);
  if (agent) {
    state.selectedAgentId = agent.id;
  } else {
    state.selectedAgentId = null;
  }
  renderAgentDetail();
});

const drawScene = (time) => {
  drawMap();
  syncSprites();
  state.agents.forEach((agent) => {
    const sprite = ensureSprite(agent);
    updateSprite(sprite, agent);
  });
  drawInteractions();
  state.agents.forEach((agent) => {
    const sprite = ensureSprite(agent);
    drawAgent(agent, sprite, time);
  });
  drawHud();
};

const loop = (time) => {
  drawScene(time);
  requestAnimationFrame(loop);
};

updateStatus(false);
connect();
renderSessionPanel();
requestAnimationFrame(loop);
