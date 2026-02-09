import { Container, Graphics, Sprite, Stage, Text, useTick } from "@pixi/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Graphics as PixiGraphics } from "pixi.js";
import {
  BaseTexture,
  Rectangle,
  SCALE_MODES,
  settings,
  Texture,
  TextMetrics,
  TextStyle,
} from "pixi.js";
import type { Agent, Interaction, SessionInfo, TodoSummary } from "./useOfficeState";
import { ActivityBubble } from "./components/pixi/ActivityBubble";
import type { ActivityBubbleData } from "./components/pixi/ActivityBubble";
import { MessageBubble } from "./components/pixi/MessageBubble";
import type { MessageBubbleData } from "./components/pixi/MessageBubble";
import { findPath } from "./pathfinding";
import { drawRoundedRect } from "./components/pixi/drawRoundedRect";

settings.SCALE_MODE = SCALE_MODES.NEAREST;
settings.ROUND_PIXELS = true;



type RenderableItem = { type: "agent"; id: string; y: number };

type DirectionFrames = {
  right: Texture[];
  down: Texture[];
  up: Texture[];
};

type SpriteState = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  homeTile: { row: number; col: number };
  targetTile?: { row: number; col: number };
  path?: { row: number; col: number }[];
  pathIndex?: number;
  targetKind?: "work" | "wander" | "exit";
  retargetAt?: number;
  dirLockUntil?: number;
  wanderUntil?: number;
  idlePauseUntil?: number;
  workLockUntil?: number;
  lastMoveAt?: number;
  lastPosX?: number;
  lastPosY?: number;
  direction: "front" | "back" | "left" | "right";
  exiting?: boolean;
  exitAt?: number;
  goodbyeUntil?: number;
  removeAt?: number;
};

type SpriteSheets = {
  idle?: DirectionFrames;
  walk?: DirectionFrames;
  run?: DirectionFrames;
  jump?: DirectionFrames;
};

const TileMap = ({ map, textures }: { map: string[][]; textures: { [key: string]: Texture | null } }) => {
  if (!map || !textures) return null;
  const sprites: JSX.Element[] = [];

  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      const type = map[r][c];

      // Filter out transparent tiles for Overlay Mode
      // We explicitly WANT "door_open" to render (as floor) to cover the background.
      // We explicitly WANT "door_closed" (or partition) to render.
      // We SKIP normal "floor" and "grass" to let background show.
      if (!type || type === "grass" || type === "floor" || type === "path" || type === "carpet" || type === "window") {
        continue;
      }

      const texture = textures[type];
      if (texture) {
        sprites.push(<Sprite key={`${r}-${c}`} texture={texture} x={c * TILE} y={r * TILE} />);
      }
    }
  }
  return <Container>{sprites}</Container>;
};

type PixiSceneProps = {
  agents: Agent[];
  interactions: Interaction[];
  sessions: SessionInfo[];
  activeSessionId: string | null;
  lastTodoSummary: TodoSummary | null;
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
  activeTab?: "opencode" | "claude";
};

const TILE = 4;
// Offset for grid alignment (if needed)
const OFFSET_Y = 0;
const OFFSET_X = 0;

const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 540;
const DEFAULT_MAP_COLS = Math.floor(DEFAULT_WIDTH / TILE);
const DEFAULT_MAP_ROWS = Math.floor(DEFAULT_HEIGHT / TILE);

const COLORS = {
  grass: 0xa8d070,
  grassShadow: 0x8bb85f,
  path: 0xf0d69a,
  pathShadow: 0xd7be7f,
  floor: 0xdabf86,
  floorShadow: 0xc5a874,
  wall: 0x8b7a5c,
  wallShadow: 0x6f5f45,
  desk: 0x8d6b4f,
  deskShadow: 0x75543d,
  window: 0x8ccde9,
  hud: 0x3b3766,
  hudBorder: 0x6f6ab0,
  hudInset: 0x242047,
  text: 0xfaf2dd,
  shadow: 0x1b1a2b,
  idle: 0x9ac7b8,
  thinking: 0xf6c876,
  working: 0x6fb5ff,
  planning: 0xc1a1ff,
  error: 0xff7a7a,
  link: 0x9df5c0,
};

const AVATAR_COLORS = [
  0xf2a271,
  0x7bdff2,
  0xb9f18c,
  0xf5e960,
  0xb38df4,
  0xf28ca2,
  0x8cc5ff,
  0xf7b978,
];

const MESSAGE_TTL_MS = 3000;
const TYPING_TTL_MS = 800;
const MESSAGE_MAX_WIDTH = 140;
const MESSAGE_MIN_WIDTH = 48;
const MESSAGE_MAX_LINES = 10;
const MESSAGE_PADDING = 6;
const ACTIVITY_TTL_MS = 1400;
// Event visuals mapping:
// tool.execute.before/after => ring (color by before/after)
// file.edited/file.watcher.updated => ✏️
// message.updated/message.part.updated => 💭 (status)
// message.removed/message.part.removed => gray badge
// command.executed/installation.updated/lsp.*/permission.*/server.connected/tui.* => colored badge
// session.* => meeting-room lamp
// todo.updated => clipboard pop
const EVENT_TTL_MS = 4000;
const EVENT_BADGE_COLORS: Record<string, number> = {
  "command.executed": 0xf2c14e,
  "installation.updated": 0x7aa0d8,
  "lsp.client.diagnostics": 0xf06a6a,
  "lsp.updated": 0x7aa0d8,
  "message.removed": 0x9aa3b2,
  "message.part.removed": 0x9aa3b2,
  "permission.asked": 0xc39be0,
  "permission.replied": 0x7fcf9a,
  "server.connected": 0x6bd5c1,
  "tui.prompt.append": 0x7fd3ff,
  "tui.command.execute": 0x7fd3ff,
  "tui.toast.show": 0x7fd3ff,
};
const EXIT_TTL_MS = 2600;
const GOODBYE_TTL_MS = 1400;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const hashId = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 997;
  }
  return hash;
};

const pickNode = (id: string, nodes: { row: number; col: number }[], fallback: { row: number; col: number }) => {
  if (!nodes || nodes.length === 0) {
    return fallback;
  }
  return nodes[hashId(id) % nodes.length];
};

const nodeKey = (row: number, col: number) => `${row},${col}`;
const EXIT_OFFSET_X = 12;
const EXIT_OFFSET_Y = -4;
const EXIT_RADIUS = 5;

const pickExitTarget = (
  current: { row: number; col: number },
  exitNodes: { row: number; col: number }[],
  grid: number[][]
) => {
  const inBounds = (row: number, col: number) =>
    row >= 0 && col >= 0 && row < grid.length && col < grid[0].length;
  const isWalkable = (row: number, col: number) => grid[row][col] > 0;

  let best = exitNodes[0] || current;
  let bestDist = Number.POSITIVE_INFINITY;

  exitNodes.forEach((node) => {
    for (let dr = -EXIT_RADIUS; dr <= EXIT_RADIUS; dr += 1) {
      for (let dc = -EXIT_RADIUS; dc <= EXIT_RADIUS; dc += 1) {
        const row = node.row + dr;
        const col = node.col + dc;
        if (!inBounds(row, col)) continue;
        if (!isWalkable(row, col)) continue;
        const dist = Math.abs(row - current.row) + Math.abs(col - current.col);
        if (dist < bestDist) {
          bestDist = dist;
          best = { row, col };
        }
      }
    }
  });

  return best;
};

const simplifyPath = (path: { row: number; col: number }[]) => {
  if (path.length <= 2) {
    return path;
  }
  const result: { row: number; col: number }[] = [path[0]];
  let prev = path[0];
  let prevDir = {
    row: path[1].row - prev.row,
    col: path[1].col - prev.col,
  };
  for (let i = 1; i < path.length - 1; i += 1) {
    const current = path[i];
    const next = path[i + 1];
    const dir = { row: next.row - current.row, col: next.col - current.col };
    if (dir.row !== prevDir.row || dir.col !== prevDir.col) {
      result.push(current);
      prevDir = dir;
    }
    prev = current;
  }
  result.push(path[path.length - 1]);
  return result;
};

const tileToPixel = (tile: { col: number; row: number }) => ({
  x: tile.col * TILE + TILE / 2 + OFFSET_X,
  y: tile.row * TILE + TILE / 2 + OFFSET_Y,
});

const pixelToTile = (x: number, y: number) => ({
  col: Math.round((x - OFFSET_X - TILE / 2) / TILE),
  row: Math.round((y - OFFSET_Y - TILE / 2) / TILE),
});

const doorTile = () => {
  // Fallback to center of default layout (48, 48)
  return { row: 48 * 2, col: 48 * 2 };
};

const statusSpeed = (status: string) => {
  switch (status) {
    case "idle":
      return 0.35;
    case "thinking":
      return 0.55;
    case "planning":
      return 0.5;
    case "error":
      return 0.35;
    case "working":
    default:
      return 0.7;
  }
};

const statusRadius = (status: string) => {
  switch (status) {
    case "working":
      return 0;
    case "idle":
      return 6;
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

const shouldBeAtDesk = (status: string) =>
  status !== "idle" && status !== "";

const pickAvatarColor = (agent: Agent) => {
  const id = agent.id || "";
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 997;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

// Tag color palettes for different sessions (fill, stroke pairs)
const TAG_COLORS: [number, number][] = [
  [0x2b5a3c, 0x73d28f], // green
  [0x3a4a6b, 0x7a9fd8], // blue
  [0x5a3a5a, 0xc28fd2], // purple
  [0x5a4a2b, 0xd2a873], // orange
  [0x3a5a5a, 0x73c2c2], // teal
  [0x5a2b3a, 0xd27389], // pink
  [0x4a4a3a, 0xa8a878], // olive
  [0x3a3a5a, 0x8888c2], // indigo
];

const pickTagColors = (sessionId?: string): [number, number] => {
  if (!sessionId) return TAG_COLORS[0];
  let hash = 0;
  for (let i = 0; i < sessionId.length; i += 1) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) % 997;
  }
  return TAG_COLORS[hash % TAG_COLORS.length];
};

const statusBubbleText = (status: string) => {
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

const wrapLines = (
  text: string,
  maxWidth: number,
  style: TextStyle,
  maxLines: number
) => {
  if (!text) {
    return [""];
  }
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (TextMetrics.measureText(next, style).width <= maxWidth) {
      current = next;
    } else {
      if (current) {
        lines.push(current);
      }
      current = word;
    }
  });

  if (current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    const trimmed = lines.slice(lines.length - maxLines);
    trimmed[0] = `...${trimmed[0]}`;
    return trimmed;
  }

  return lines;
};

const buildTileTexture = (type: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  const drawRect = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  switch (type) {
    case "grass":
      drawRect("#a8d070", 0, 0, TILE, TILE);
      drawRect("#b7de7c", 0, 0, TILE, 4);
      drawRect("#8bb85f", 0, TILE - 12, TILE, 12);
      drawRect("#7aa44f", 0, TILE - 4, TILE, 4);
      drawRect("#96c86a", 8, 8, 8, 8);
      drawRect("#96c86a", 36, 24, 8, 8);
      break;
    case "path":
      drawRect("#d4c4a8", 0, 0, TILE, TILE);
      drawRect("#e4d7bf", 0, 0, TILE, 4);
      drawRect("#bfae94", 0, TILE - 10, TILE, 10);
      drawRect("#ac9b82", 0, TILE - 4, TILE, 4);
      drawRect("#c9b89e", 12, 12, 8, 8);
      drawRect("#c9b89e", 40, 28, 8, 8);
      break;
    case "wall_face":
      // Top Cap (Partition style) - Height 10
      drawRect("#4a4a5c", 0, 0, TILE, 20);
      drawRect("#5a5a6e", 0, 0, TILE, 4);
      drawRect("#3a3a4a", 0, 16, TILE, 4);

      // Wall Face - Middle
      drawRect("#6e6e82", 0, 20, TILE, TILE - 28);

      // Baseboard - Bottom 4
      drawRect("#4a4a5c", 0, TILE - 8, TILE, 8);
      break;
    case "partition_h":
    case "partition_h_top":
      // Thin horizontal partition strip
      if (type === "partition_h") {
        drawRect("#e8dcc8", 0, 0, TILE, TILE); // Floor Background for internal
      } else {
        // partition_h_top: Wall at top, Void below
        // Wall is 0..12. Void is 12..32
        drawRect("#121212", 0, 24, TILE, TILE - 24);
      }

      const phH = 24;
      const phY = type === "partition_h_top" ? 0 : (TILE - phH) / 2;

      drawRect("#4a4a5c", 0, phY, TILE, phH); // Dark base
      drawRect("#5a5a6e", 0, phY + 4, TILE, phH - 8); // Lighter top surface
      drawRect("#3a3a4a", 0, phY + phH - 4, TILE, 4); // Shadow on bottom
      break;
    case "partition_v":
    case "partition_v_left":
    case "partition_v_right":
      // Thin vertical partition strip
      const pvW = 24;
      let pvX = (TILE - pvW) / 2;
      if (type === "partition_v_left") pvX = 0;
      if (type === "partition_v_right") pvX = TILE - pvW;

      if (type === "partition_v") {
        drawRect("#e8dcc8", 0, 0, TILE, TILE); // Floor Background for internal
      } else if (type === "partition_v_left") {
        // Wall at Left (0..12). Void at Right (12..32)
        drawRect("#121212", 24, 0, TILE - 24, TILE);
      } else if (type === "partition_v_right") {
        // Wall at Right (20..32). Void at Left (0..20)
        drawRect("#121212", 0, 0, TILE - 24, TILE);
      }

      drawRect("#4a4a5c", pvX, 0, pvW, TILE); // Dark base
      drawRect("#5a5a6e", pvX + 4, 0, pvW - 8, TILE); // Lighter top surface
      drawRect("#3a3a4a", pvX + pvW - 4, 0, 4, TILE); // Shadow on right
      break;
    case "floor":
      drawRect("#e8dcc8", 0, 0, TILE, TILE);
      drawRect("#f3ead9", 0, 0, TILE, 4);
      drawRect("#d9ccb5", 0, TILE - 4, TILE, 4);
      drawRect("#c7b59f", 0, TILE - 2, TILE, 2);
      drawRect("#f0e6d6", 4, 4, 4, 4);
      drawRect("#f0e6d6", 36, 36, 4, 4);
      break;


    default:
      // Empty transparency for default
      ctx.clearRect(0, 0, TILE, TILE);
  }
  const texture = Texture.from(canvas);
  texture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
  return texture;
};
const TitleBadge = ({ x, y, activeTab }: { x: number; y: number; activeTab?: "opencode" | "claude" }) => {
  const titleText = activeTab === "claude" ? "Claude Office" : "OpenCode Office";
  const titleStyle = useMemo(
    () =>
      new TextStyle({
        fill: 0xffffff,
        fontFamily: "Courier New",
        fontSize: 11,
        fontWeight: "bold",
        letterSpacing: 1,
      }),
    []
  );
  const textWidth = TextMetrics.measureText(titleText, titleStyle).width;
  const paddingX = 10;
  const paddingY = 5;
  const badgeWidth = textWidth + paddingX * 2;
  const badgeHeight = 18;

  return (
    <Container x={x} y={y}>
      <Graphics
        draw={(graphics: PixiGraphics) => {
          graphics.clear();
          graphics.beginFill(0x1a1a2e, 0.5);
          graphics.drawRoundedRect(2, 2, badgeWidth, badgeHeight, 4);
          graphics.endFill();
          graphics.beginFill(0x2d3a4f);
          graphics.drawRoundedRect(0, 0, badgeWidth, badgeHeight, 4);
          graphics.endFill();
          graphics.beginFill(0x3d4a5f);
          graphics.drawRoundedRect(0, 0, badgeWidth, 6, 4);
          graphics.endFill();
          graphics.lineStyle(1, 0x4a5a6f);
          graphics.drawRoundedRect(0, 0, badgeWidth, badgeHeight, 4);
          graphics.lineStyle(0);
          graphics.beginFill(0x6fb5ff);
          graphics.drawCircle(8, badgeHeight / 2, 2);
          graphics.endFill();
        }}
      />
      <Text
        text={titleText}
        x={paddingX + 4}
        y={paddingY - 1}
        style={titleStyle}
      />
    </Container>
  );
};

// SceneLayer now accepts dims props to handle logic that depends on map size
const SceneLayer = ({
  agents,
  interactions,
  sessions,
  activeSessionId,
  lastTodoSummary,
  selectedAgentId,
  onSelectAgent,
  activeTab,
  sceneWidth,
  sceneHeight,
  setDimensions,
}: PixiSceneProps & { sceneWidth: number; sceneHeight: number; setDimensions: (d: { width: number; height: number }) => void }) => {
  const [frame, setFrame] = useState(0);
  const timeRef = useRef(0);
  const spritesRef = useRef<Map<string, SpriteState>>(new Map());
  const agentCacheRef = useRef<Map<string, Agent>>(new Map());
  const [spriteSheets, setSpriteSheets] = useState<SpriteSheets>({});

  // Clear sprite state when switching tabs for a clean refresh
  useEffect(() => {
    spritesRef.current.clear();
    agentCacheRef.current.clear();
  }, [activeTab]);

  const [tileMap, setTileMap] = useState<string[][]>(() =>
    Array.from({ length: DEFAULT_MAP_ROWS }, () =>
      Array.from({ length: DEFAULT_MAP_COLS }, () => "")
    )
  );
  // Collision State
  const [collisionMap, setCollisionMap] = useState<{
    rows: number;
    cols: number;
    grid: number[][];
    workNodes: { row: number, col: number }[];
    workCenters: { row: number, col: number }[];
    doorNodes: { row: number, col: number }[];
    exitNodes: { row: number, col: number }[];
  } | null>(null);

  // Helper to check walkability
  const isWalkable = (col: number, row: number) => {
    if (!collisionMap) {
      return col >= 0 && row >= 0 && row < DEFAULT_MAP_ROWS && col < DEFAULT_MAP_COLS;
    }
    if (col < 0 || row < 0 || col >= collisionMap.cols || row >= collisionMap.rows) return false;
    // Walkable if state > 0. (1=Floor, 2=Work, 3=Rest, 4=Door)
    return collisionMap.grid[row][col] > 0;
  };

  const getRandomWalkable = (allowChairs: boolean) => {
    if (!collisionMap) return { row: 32, col: 32 };
    for (let i = 0; i < 80; i++) {
      const r = Math.floor(Math.random() * collisionMap.rows);
      const c = Math.floor(Math.random() * collisionMap.cols);
      const state = collisionMap.grid[r][c];
      if (state <= 0) continue;
      if (!allowChairs && state === 2) continue;
      return { row: r, col: c };
    }
    return { row: 32, col: 32 };
  };

  // Load Collision Image
  useEffect(() => {
    const img = new Image();
    img.src = "/office_floor.png";
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      setDimensions({ width: w, height: h }); // Update Stage Size

      // Generate Grid
      const cols = Math.floor(w / TILE);
      const rows = Math.floor(h / TILE);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, w, h).data;

      const newGrid: number[][] = [];
      for (let r = 0; r < rows; r++) {
        const rowArr: number[] = [];
        for (let c = 0; c < cols; c++) {
          // Consensus Strategy: Scan the tile with a fine grid (2px steps)
          // Total 8x8 Tile area (16 samples).

          let transparentSamples = 0;
          let blueSamples = 0;   // Work Chair #0000FF
          let greenSamples = 0;  // Door #00FF00
          let redSamples = 0;    // Exit #FF0000
          let totalSamples = 0;
          const px = c * TILE;
          const py = r * TILE;

          // Scan interior
          for (let sy = 1; sy < TILE; sy += 2) {
            for (let sx = 1; sx < TILE; sx += 2) {
              const sampleX = px + sx;
              const sampleY = py + sy;

              if (sampleX < 0 || sampleX >= w || sampleY < 0 || sampleY >= h) {
                totalSamples++;
                continue;
              }

              const idx = (Math.floor(sampleY) * w + Math.floor(sampleX)) * 4;
              if (idx >= 0 && idx < pixels.length) {
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                const a = pixels[idx + 3];

                // Color Detection
                if (b > 200 && r < 50 && g < 50) { // Blue (Work Chair)
                  blueSamples++;
                } else if (g > 200 && r < 50 && b < 50) { // Green (Door)
                  greenSamples++;
                } else if (r > 200 && g < 50 && b < 50) { // Red (Exit)
                  redSamples++;
                } else if (a < 50) {
                  transparentSamples++;
                }
              }
              totalSamples++;
            }
          }

          const blueRatio = totalSamples > 0 ? blueSamples / totalSamples : 0;
          const greenRatio = totalSamples > 0 ? greenSamples / totalSamples : 0;
          const redRatio = totalSamples > 0 ? redSamples / totalSamples : 0;
          const ratio = totalSamples > 0 ? transparentSamples / totalSamples : 0;

          // State Priority:
          // 5 = Exit (Red)
          // 4 = Door (Green)
          // 2 = Work Chair (Blue)
          // 1 = Floor (Transparent)
          // 0 = Blocked (Default + Yellow)
          let state = 0;
          if (redRatio > 0.3) state = 5;
          else if (greenRatio > 0.3) state = 4;
          else if (blueRatio > 0.3) state = 2;
          else if (ratio > 0.6) state = 1;

          rowArr.push(state);
        }
        newGrid.push(rowArr);
      }

      // Post-Process: Collect Nodes
      const workNodes: { row: number, col: number }[] = [];
      const workCenters: { row: number, col: number }[] = [];
      const doorNodes: { row: number, col: number }[] = [];
      const exitNodes: { row: number, col: number }[] = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const s = newGrid[r][c];
          if (s === 2) workNodes.push({ row: r, col: c });
          if (s === 4) doorNodes.push({ row: r, col: c });
          if (s === 5) exitNodes.push({ row: r, col: c });
        }
      }

      // Compute work chair centers (connected regions)
      const visited = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => false)
      );
      const inBounds = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols;
      const deltas = [
        { row: 1, col: 0 },
        { row: -1, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: -1 },
      ];
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (visited[r][c] || newGrid[r][c] !== 2) continue;
          const stack = [{ row: r, col: c }];
          const cluster: { row: number; col: number }[] = [];
          visited[r][c] = true;
          while (stack.length > 0) {
            const node = stack.pop();
            if (!node) break;
            cluster.push(node);
            deltas.forEach((d) => {
              const nr = node.row + d.row;
              const nc = node.col + d.col;
              if (!inBounds(nr, nc)) return;
              if (visited[nr][nc]) return;
              if (newGrid[nr][nc] !== 2) return;
              visited[nr][nc] = true;
              stack.push({ row: nr, col: nc });
            });
          }
          if (cluster.length > 0) {
            const avgRow = cluster.reduce((sum, n) => sum + n.row, 0) / cluster.length;
            const avgCol = cluster.reduce((sum, n) => sum + n.col, 0) / cluster.length;
            let best = cluster[0];
            let bestDist = Number.POSITIVE_INFINITY;
            cluster.forEach((n) => {
              const dist = Math.abs(n.row - avgRow) + Math.abs(n.col - avgCol);
              if (dist < bestDist) {
                bestDist = dist;
                best = n;
              }
            });
            workCenters.push(best);
          }
        }
      }

      // Initialize Door Visuals
      // We need to update the tileMap to show "closed door" (partition_v) where green pixels are
      // But only if we want them to start closed.
      setTileMap(() => {
        const base = Array.from({ length: rows }, () =>
          Array.from({ length: cols }, () => "")
        );
        doorNodes.forEach(node => {
          if (node.row < base.length && node.col < base[0].length) {
            base[node.row][node.col] = "door_closed";
          }
        });
        return base;
      });

      setCollisionMap({ rows, cols, grid: newGrid, workNodes, workCenters, doorNodes, exitNodes });
      console.log("Generated Collision Map", { width: w, height: h, rows, cols });
    };
  }, []); // Run once

  // ... (rest of component, replacing usage of globals with local helpers)

  const tileTextures = useMemo(() => {
    const types = [
      "floor",
    ];
    const textures: Record<string, Texture | null> = {};
    types.forEach((type) => {
      textures[type] = buildTileTexture(type);
    });
    // Dynamic Door Aliases
    textures["door_open"] = textures["floor"];
    textures["door_closed"] = null; // No visual, show background
    return textures;
  }, []);
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );
  const labelStyle = useMemo(
    () =>
      new TextStyle({
        fill: COLORS.text,
        fontFamily: "Courier New",
        fontSize: 10,
      }),
    []
  );
  const aliasStyle = useMemo(
    () =>
      new TextStyle({
        fill: 0xd0f5df,
        fontFamily: "Courier New",
        fontSize: 10,
      }),
    []
  );
  const statusStyle = useMemo(
    () =>
      new TextStyle({
        fill: 0x2b3f5c,
        fontFamily: "Courier New",
        fontSize: 10,
      }),
    []
  );
  const bubbleStyle = useMemo(
    () =>
      new TextStyle({
        fill: 0x3a5b3c,
        fontFamily: "Courier New",
        fontSize: 9,
      }),
    []
  );
  const activityStyle = useMemo(
    () =>
      new TextStyle({
        fill: 0x2b3f5c,
        fontFamily: "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji",
        fontSize: 12,
      }),
    []
  );

  useEffect(() => {
    const loadSheet = (url: string, columns: number) =>
      new Promise<DirectionFrames>((resolve, reject) => {
        const base = BaseTexture.from(url);
        base.scaleMode = SCALE_MODES.NEAREST;
        const build = () => {
          const frameWidth = Math.floor(base.width / columns);
          const frameHeight = Math.floor(base.height / 3);
          const buildRow = (row: number) => {
            const frames = [] as Texture[];
            for (let col = 0; col < columns; col += 1) {
              frames.push(
                new Texture(
                  base,
                  new Rectangle(col * frameWidth, row * frameHeight, frameWidth, frameHeight)
                )
              );
            }
            return frames;
          };
          resolve({
            right: buildRow(0),
            down: buildRow(1),
            up: buildRow(2),
          });
        };
        if (base.valid) {
          build();
        } else {
          base.once("loaded", build);
          base.once("error", reject);
        }
      });

    const loadAll = async () => {
      try {
        const [idle, walk, run, jump] = await Promise.all([
          loadSheet("/idle.png", 4),
          loadSheet("/walk.png", 8),
          loadSheet("/run.png", 8),
          loadSheet("/jump.png", 6),
        ]);
        setSpriteSheets({ idle, walk, run, jump });

      } catch {
        setSpriteSheets({});
      }
    };
    loadAll();
  }, []);

  useEffect(() => {
    const spriteMap = spritesRef.current;
    const agentCache = agentCacheRef.current;
    const now = Date.now();
    const ids = new Set(agents.map((agent) => agent.id));
    const exitNode = collisionMap?.exitNodes?.[0] ?? doorTile();
    agents.forEach((agent) => {
      agentCache.set(agent.id, agent);
    });
    for (const id of spriteMap.keys()) {
      if (!ids.has(id)) {
        const existing = spriteMap.get(id);
        if (existing && !existing.exiting) {
          const targetTile = collisionMap
            ? pickExitTarget(pixelToTile(existing.x, existing.y), collisionMap.exitNodes, collisionMap.grid)
            : exitNode;
          const baseTarget = tileToPixel(targetTile);
          const exitTarget = { x: baseTarget.x + EXIT_OFFSET_X, y: baseTarget.y + EXIT_OFFSET_Y };
          spriteMap.set(id, {
            ...existing,
            exiting: true,
            exitAt: now,
            goodbyeUntil: undefined,
            removeAt: undefined,
            targetX: exitTarget.x,
            targetY: exitTarget.y,
            targetKind: "exit",
            targetTile: targetTile,
            path: collisionMap
              ? simplifyPath(findPath(collisionMap.grid, pixelToTile(existing.x, existing.y), targetTile))
              : [],
            pathIndex: 1,
            direction: "front",
          });
        }
      }
    }
    agents.forEach((agent) => {
      if (spriteMap.has(agent.id)) {
        return;
      }
      const fallbackTile = { row: 32, col: 32 };
      const homeTile = collisionMap?.workCenters?.length
        ? pickNode(agent.id, collisionMap.workCenters, fallbackTile)
        : collisionMap?.workNodes?.length
          ? pickNode(agent.id, collisionMap.workNodes, fallbackTile)
          : fallbackTile;
      const position = tileToPixel(homeTile);
      spriteMap.set(agent.id, {
        x: position.x,
        y: position.y,
        targetX: position.x,
        targetY: position.y,
        homeTile: { row: homeTile.row, col: homeTile.col },
        direction: "front",
      });
    });
  }, [agents, collisionMap]); // Re-run when collision map loads

  useTick((delta: number) => {
    timeRef.current += delta * 16;
    const spriteMap = spritesRef.current;
    const agentCache = agentCacheRef.current;
    const agentIds = new Set(agents.map((agent) => agent.id));
    const occupiedTiles = new Map<string, string>();
    agents.forEach((agent) => {
      const sprite = spriteMap.get(agent.id);
      if (!sprite || sprite.exiting) {
        return;
      }
      const tile = pixelToTile(sprite.x, sprite.y);
      occupiedTiles.set(nodeKey(tile.row, tile.col), agent.id);
    });
    agents.forEach((agent) => {
      const sprite = spriteMap.get(agent.id);
      if (!sprite) {
        return;
      }
      const deskTarget = tileToPixel(sprite.homeTile);

      // -- Target Logic (Pathfinding) --
      const currentTile = pixelToTile(sprite.x, sprite.y);
      const isWorking = shouldBeAtDesk(agent.status || "working");
      const isOccupied = (tile: { row: number; col: number }) => {
        const occupant = occupiedTiles.get(nodeKey(tile.row, tile.col));
        return occupant && occupant !== agent.id;
      };
      let workTarget = sprite.homeTile;
      const workCandidates = collisionMap?.workCenters?.length
        ? collisionMap.workCenters
        : collisionMap?.workNodes || [];
      if (workCandidates.length) {
        let best: { row: number; col: number } | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        let bestAny: { row: number; col: number } | null = null;
        let bestAnyDist = Number.POSITIVE_INFINITY;
        workCandidates.forEach((node) => {
          const dist = Math.abs(node.row - currentTile.row) + Math.abs(node.col - currentTile.col);
          if (dist < bestAnyDist) {
            bestAny = node;
            bestAnyDist = dist;
          }
          if (!isOccupied(node) && dist < bestDist) {
            best = node;
            bestDist = dist;
          }
        });
        workTarget = best || bestAny || sprite.homeTile;
      }
      const wanderTarget = getRandomWalkable(false);
      let desiredKind: "work" | "wander" = isWorking ? "work" : "wander";
      let desiredTile = isWorking ? workTarget : wanderTarget;

      const now = Date.now();
      const distance = Math.hypot(sprite.targetX - sprite.x, sprite.targetY - sprite.y);
      const reachedTarget = distance < 0.6;
      const idlePauseActive = sprite.idlePauseUntil && now < sprite.idlePauseUntil;

      if (!isWorking) {
        if (idlePauseActive) {
          sprite.targetX = sprite.x;
          sprite.targetY = sprite.y;
          return;
        }
        if (sprite.idlePauseUntil && now >= sprite.idlePauseUntil) {
          sprite.idlePauseUntil = undefined;
          sprite.wanderUntil = now + 3000 + Math.floor(Math.random() * 2000);
          sprite.path = [];
          sprite.pathIndex = undefined;
          sprite.targetTile = undefined;
          sprite.targetKind = undefined;
          sprite.retargetAt = 0;
        }
        if (!sprite.wanderUntil) {
          sprite.idlePauseUntil = now + 2000;
          sprite.path = [];
          sprite.pathIndex = undefined;
          sprite.targetTile = undefined;
          sprite.targetKind = undefined;
          sprite.retargetAt = 0;
        }
      }

      const workLocked = sprite.workLockUntil && now < sprite.workLockUntil;
      const needsNewTarget =
        !sprite.targetTile ||
        (!workLocked && sprite.targetKind !== desiredKind) ||
        (isWorking ? reachedTarget : (!sprite.wanderUntil || now > sprite.wanderUntil));

      if (collisionMap && needsNewTarget && (!sprite.path || sprite.path.length === 0)) {
        sprite.targetKind = desiredKind;
        sprite.targetTile = desiredTile;
        let rawPath = findPath(collisionMap.grid, currentTile, desiredTile);
        if (rawPath.length === 0 && desiredKind === "work") {
          const chairPos = tileToPixel(desiredTile);
          sprite.x = chairPos.x;
          sprite.y = chairPos.y;
          sprite.targetX = chairPos.x;
          sprite.targetY = chairPos.y;
          sprite.path = [];
          sprite.pathIndex = undefined;
        } else {
          sprite.path = simplifyPath(rawPath);
        }
        sprite.pathIndex = sprite.path.length > 1 ? 1 : 0;
        sprite.retargetAt = now + 1400;
        if (isWorking) {
          sprite.workLockUntil = now + 2200;
        }
      }

      if (sprite.path && sprite.path.length > 0 && sprite.pathIndex !== undefined) {
        const nextIndex = Math.min(sprite.pathIndex, sprite.path.length - 1);
        const nextNode = sprite.path[nextIndex];
        if (nextNode.row === currentTile.row && nextNode.col === currentTile.col) {
          if (sprite.pathIndex < sprite.path.length - 1) {
            sprite.pathIndex += 1;
          }
        }
        const px = tileToPixel(nextNode);
        sprite.targetX = px.x;
        sprite.targetY = px.y;
      }

      const dx = sprite.targetX - sprite.x;
      const dy = sprite.targetY - sprite.y;
      const speed = statusSpeed(agent.status || "working");

      if (distance > 0.1) {
        const step = Math.min(speed, distance, 0.4);
        const nextX = sprite.x + (dx / distance) * step;
        const nextY = sprite.y + (dy / distance) * step;
        const smoothing = distance < 2 ? 0.4 : 1;
        const smoothX = sprite.x + (nextX - sprite.x) * smoothing;
        const smoothY = sprite.y + (nextY - sprite.y) * smoothing;

        // Strict Collision Check: Will the next step landing in a wall?
        const nextTile = pixelToTile(smoothX, smoothY);

        let canMove = true;

        // -- Dynamic Door Toggle --
        // Check if I am entering a Door Node
        // Or if I am ON a door node.
        if (collisionMap?.doorNodes) {
          // Check if ANY agent is on a door node
          const isOnDoor = (c: number, r: number) => {
            return collisionMap.doorNodes.some(n => n.col === c && n.row === r);
          };

          // Toggle Visuals
          // We need to do this globally or per agent?
          // "when it walk passed the door, the door become floor"
          // Let's check current tile.
          const curCol = Math.floor(sprite.x / TILE);
          const curRow = Math.floor(sprite.y / TILE);

          if (isOnDoor(curCol, curRow)) {
            // Open Door
            if (tileMap[curRow][curCol] !== "door_open") {
              // Mutate state? Careful with performance in useTick.
              // React state update in loop is bad.
              // We should ref `tileMap` in a ref if possible, or use a separate ref for visuals that the renderer reads.
              // For now, let's use the React setter but throttle it?
              // Or assume SceneLayer re-renders fast enough?
              // Let's cheat: Mutate the array directly + force update? No, React.
              // Let's just update if needed.
              setTileMap(prev => {
                const clone = [...prev];
                clone[curRow] = [...prev[curRow]];
                clone[curRow][curCol] = "door_open";
                return clone;
              });
            }
          } else {
            // Verify if we left a door?
            // We need a way to close doors when NO ONE is on them.
          }
        }

        // ... Existing Move Logic ...
        if (collisionMap && !isWalkable(nextTile.col, nextTile.row)) {
          canMove = false;
        }

        if (canMove) {
          sprite.x = smoothX;
          sprite.y = smoothY;
          const lastX = sprite.lastPosX ?? sprite.x;
          const lastY = sprite.lastPosY ?? sprite.y;
          const moved =
            sprite.lastPosX === undefined ||
            Math.hypot(sprite.x - lastX, sprite.y - lastY) > 0.05;
          if (moved) {
            sprite.lastPosX = sprite.x;
            sprite.lastPosY = sprite.y;
            sprite.lastMoveAt = now;
          }
          const lockExpired = !sprite.dirLockUntil || now > sprite.dirLockUntil;
          if (lockExpired && distance > 3) {
            if (Math.abs(dx) > Math.abs(dy)) {
              if (Math.abs(dx) > 4) {
                sprite.direction = dx > 0 ? "right" : "left";
                sprite.dirLockUntil = now + 250;
              }
            } else {
              if (Math.abs(dy) > 4) {
                sprite.direction = dy > 0 ? "front" : "back";
                sprite.dirLockUntil = now + 250;
              }
            }
          }
        } else {
          sprite.targetX = sprite.x;
          sprite.targetY = sprite.y;
          sprite.direction = "front";
        }
      } else if (distance < 0.2) {
        if (shouldBeAtDesk(agent.status || "working")) {
          sprite.direction = "back";
        } else {
          sprite.direction = "front";
        }
      }

      if (isWorking && sprite.lastMoveAt && now - sprite.lastMoveAt > 1500) {
        const chairPos = tileToPixel(workTarget);
        sprite.x = chairPos.x;
        sprite.y = chairPos.y;
        sprite.targetX = chairPos.x;
        sprite.targetY = chairPos.y;
        sprite.path = [];
        sprite.pathIndex = undefined;
        sprite.lastMoveAt = now;
      }

      if (distance < 0.2) {
        if (sprite.path && sprite.pathIndex !== undefined) {
          if (sprite.pathIndex < sprite.path.length - 1) {
            sprite.pathIndex += 1;
          } else {
            sprite.path = [];
            sprite.pathIndex = undefined;
            if (!isWorking) {
              sprite.idlePauseUntil = now + 2000;
              sprite.wanderUntil = undefined;
            }
          }
        }
      }
    });

    // Global Door Check (To Close Doors)
    if (collisionMap?.doorNodes) {
      collisionMap.doorNodes.forEach(node => {
        // Check if ANY agent is on this node
        const occupied = agents.some(a => {
          const s = spriteMap.get(a.id);
          if (!s) return false;
          const c = Math.floor(s.x / TILE);
          const r = Math.floor(s.y / TILE);
          return c === node.col && r === node.row;
        });

        if (!occupied && tileMap[node.row][node.col] === "door_open") {
          // Close it
          setTileMap(prev => {
            if (prev[node.row][node.col] !== "door_closed") {
              const clone = [...prev];
              clone[node.row] = [...prev[node.row]];
              clone[node.row][node.col] = "door_closed";
              return clone;
            }
            return prev;
          });
        }
      });
    }

    const exitNode = collisionMap?.exitNodes?.[0] ?? doorTile();
    for (const [id, sprite] of spriteMap.entries()) {
      if (!sprite.exiting || agentIds.has(id)) {
        continue;
      }
      const targetTile = collisionMap
        ? pickExitTarget(pixelToTile(sprite.x, sprite.y), collisionMap.exitNodes, collisionMap.grid)
        : exitNode;
      const baseTarget = tileToPixel(targetTile);
      const exitTarget = { x: baseTarget.x + EXIT_OFFSET_X, y: baseTarget.y + EXIT_OFFSET_Y };

      if (collisionMap && (!sprite.path || sprite.path.length === 0)) {
        const currentTile = pixelToTile(sprite.x, sprite.y);
        sprite.path = simplifyPath(findPath(collisionMap.grid, currentTile, targetTile));
        sprite.pathIndex = sprite.path.length > 1 ? 1 : 0;
      }
      if (sprite.path && sprite.path.length > 0 && sprite.pathIndex !== undefined) {
        const nextIndex = Math.min(sprite.pathIndex, sprite.path.length - 1);
        const nextNode = sprite.path[nextIndex];
        const px = tileToPixel(nextNode);
        sprite.targetX = px.x;
        sprite.targetY = px.y;
      } else {
        sprite.targetX = baseTarget.x;
        sprite.targetY = baseTarget.y;
      }
      const dx = sprite.targetX - sprite.x;
      const dy = sprite.targetY - sprite.y;
      const distance = Math.hypot(dx, dy);
      const step = Math.min(0.85, distance);
      if (distance > 0.1) {
        const nextX = sprite.x + (dx / distance) * step;
        const nextY = sprite.y + (dy / distance) * step;
        const nextTile = pixelToTile(nextX, nextY);
        if (!collisionMap || isWalkable(nextTile.col, nextTile.row)) {
          sprite.x = nextX;
          sprite.y = nextY;
        }
      }
      sprite.direction = dy > 0 ? "front" : "back";
      if (!sprite.exitAt) {
        sprite.exitAt = Date.now();
      }
      if (distance < 0.2 && !sprite.goodbyeUntil && (!sprite.path || sprite.path.length === 0)) {
        const now = Date.now();
        sprite.goodbyeUntil = now + GOODBYE_TTL_MS;
        sprite.removeAt = now + GOODBYE_TTL_MS;
      }
      if (distance < 0.2 && sprite.path && sprite.pathIndex !== undefined) {
        if (sprite.pathIndex < sprite.path.length - 1) {
          sprite.pathIndex += 1;
        } else {
          sprite.path = [];
          sprite.pathIndex = undefined;
        }
      }
      if (
        distance < 1 &&
        (!sprite.goodbyeUntil || Date.now() > sprite.goodbyeUntil) &&
        (sprite.removeAt && Date.now() > sprite.removeAt)
      ) {
        spriteMap.delete(id);
        agentCache.delete(id);
      }
    }
    setFrame((current) => current + 1);
  });

  const time = timeRef.current;
  const activeStatus = activeSession?.status ? activeSession.status.toLowerCase() : "";
  const statusUpdatedAt = activeSession?.updatedAt || 0;
  const showStatusPulse = statusUpdatedAt && time - statusUpdatedAt < EVENT_TTL_MS;
  const statusLampColor =
    activeStatus === "busy" || activeStatus === "working"
      ? 0xf2b74e
      : activeStatus === "idle"
        ? 0x6bd59b
        : activeStatus === "error"
          ? 0xf06a6a
          : 0x7aa0d8;
  const showTodoPulse =
    lastTodoSummary?.updatedAt && time - lastTodoSummary.updatedAt < EVENT_TTL_MS;
  const todoTargetId = activeSessionId
    ? agents.find((agent) => agent.sessionId === activeSessionId)?.id
    : undefined;
  const renderList: RenderableItem[] = [];
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  for (const [id, sprite] of spritesRef.current.entries()) {
    if (sprite && (agentMap.has(id) || sprite.exiting)) {
      renderList.push({ type: "agent", id, y: sprite.y });
    }
  }
  renderList.sort((a, b) => a.y - b.y);

  return (
    <>
      <Container>
        <Sprite texture={Texture.from("/office.png")} x={0} y={0} />
      </Container>
      <></>
      <TitleBadge x={8} y={8} activeTab={activeTab} />
      <Graphics
        draw={(graphics: PixiGraphics) => {
          graphics.clear();
          if (activeSession && activeStatus) {
            const lampX = sceneWidth - 26;
            const lampY = 10;
            graphics.lineStyle(2, 0x4a5f66, 1);
            graphics.beginFill(statusLampColor, showStatusPulse ? 1 : 0.6);
            graphics.drawRoundedRect(lampX, lampY, 10, 10, 3);
            graphics.endFill();
            if (showStatusPulse) {
              graphics.lineStyle(2, statusLampColor, 0.5);
              graphics.drawRoundedRect(lampX - 3, lampY - 3, 16, 16, 4);
            }
            graphics.lineStyle(0, 0, 0);
          }
        }}
      />
      <Graphics
        draw={(graphics: PixiGraphics) => {
          graphics.clear();
          interactions.forEach((interaction) => {
            const fromSprite = spritesRef.current.get(interaction.from);
            const toSprite = spritesRef.current.get(interaction.to);
            if (!fromSprite || !toSprite) {
              return;
            }
            graphics.lineStyle(2, COLORS.link, 1);
            graphics.moveTo(fromSprite.x, fromSprite.y - 8);
            graphics.lineTo(toSprite.x, toSprite.y - 8);
            graphics.lineStyle(0, 0, 0);
          });
        }}
      />
      {
        renderList.map((item) => {
          if (item.type !== "agent") return null;
          const agent = agents.find((a) => a.id === item.id) || agentCacheRef.current.get(item.id);
          if (!agent) return null;
          const sprite = spritesRef.current.get(agent.id);
          if (!sprite) return null;

          const x = sprite.x - 8;
          const y = sprite.y - 12;
          const motion = 0;
          const direction = sprite.direction || "front";
          const movement = Math.hypot(sprite.targetX - sprite.x, sprite.targetY - sprite.y);
          const isRunning = movement > 0.8;
          const isWalking = movement > 0.2;
          const currentTile = pixelToTile(sprite.x, sprite.y);
          const isOnWorkChair = Boolean(
            collisionMap?.workNodes?.some(
              (node) => node.row === currentTile.row && node.col === currentTile.col
            )
          );
          const shouldJump = agent.status === "thinking" && isOnWorkChair;
          const state = shouldJump ? "jump" : isRunning ? "run" : isWalking ? "walk" : "idle";
          const sheet = spriteSheets[state] || spriteSheets.idle;
          const frameCount = sheet?.right.length || 1;
          const frameSpeed = isRunning ? 90 : isWalking ? 120 : 200;
          const frameIndex = Math.floor(time / frameSpeed) % frameCount;
          const frameSet = sheet
            ? direction === "back"
              ? sheet.up
              : direction === "front"
                ? sheet.down
                : sheet.right
            : null;
          const texture = frameSet ? frameSet[frameIndex] : null;
          const flipX = direction === "left" ? -1 : 1;
          const aliasLabel = (agent.alias || agent.name || agent.id || "Agent")
            .slice(0, 10)
            .toUpperCase();
          const [tagFill, tagStroke] = pickTagColors(agent.sessionId);
          const messageEventAt =
            agent.lastEventType?.startsWith("message.") ? agent.lastEventAt || 0 : 0;
          const messageTimestamp = agent.lastMessageAt || messageEventAt || 0;
          const isMessageFresh =
            messageTimestamp && Date.now() - messageTimestamp < MESSAGE_TTL_MS;
          const isStreaming =
            agent.lastStreamingAt &&
            Date.now() - agent.lastStreamingAt < TYPING_TTL_MS;
          const statusText = statusBubbleText(agent.status || "working");
          const snippet = agent.lastMessageSnippet || "";
          const showGoodbye = Boolean(sprite.goodbyeUntil && Date.now() < sprite.goodbyeUntil);
          const goodbyeText = "bye";
          const messageText = showGoodbye
            ? goodbyeText
            : isStreaming
              ? ".".repeat(Math.max(1, Math.floor(time / 250) % 4))
              : snippet;
          const now = Date.now();
          const hasRecentEdit =
            agent.lastFileEditAt && now - agent.lastFileEditAt < ACTIVITY_TTL_MS;
          const eventType = agent.lastEventType || "";
          const lastEventAt = agent.lastEventAt || agent.lastActivityAt || 0;
          const hasRecentEvent = lastEventAt && now - lastEventAt < EVENT_TTL_MS;
          const isMessageUpdateEvent =
            eventType === "message.updated" || eventType === "message.part.updated";
          const isSessionEvent = eventType.startsWith("session.");
          const isToolEvent =
            hasRecentEvent &&
            (eventType === "tool.execute.before" || eventType === "tool.execute.after");
          const toolRingColor = eventType === "tool.execute.before" ? 0xf2b74e : 0x7aa0d8;
          const eventBadgeColor = EVENT_BADGE_COLORS[eventType];
          const showEventBadge =
            hasRecentEvent &&
            !isToolEvent &&
            !hasRecentEdit &&
            !isMessageUpdateEvent &&
            !isSessionEvent &&
            eventBadgeColor !== undefined;
          const isPermissionEvent = hasRecentEvent && eventType === "permission.asked";
          const isWaitingForInput = hasRecentEvent && eventType === "tui.toast.show";
          const activityEmoji =
            isPermissionEvent
              ? "❓"
              : isWaitingForInput
                ? "⏳"
                : hasRecentEdit
                  ? "✏️"
                  : agent.status === "thinking"
                    ? "💭"
                    : agent.status === "working"
                      ? "🛠️"
                      : "";
          const showActivity = Boolean(activityEmoji);
          const messageLines = wrapLines(
            messageText,
            MESSAGE_MAX_WIDTH,
            bubbleStyle,
            MESSAGE_MAX_LINES
          );
          const messageLineWidths = messageLines.map(
            (line) => TextMetrics.measureText(line, bubbleStyle).width
          );
          const messageContentWidth = messageLineWidths.length
            ? Math.max(...messageLineWidths)
            : 0;
          const messageBubbleWidth =
            Math.max(MESSAGE_MIN_WIDTH, Math.min(messageContentWidth, MESSAGE_MAX_WIDTH)) +
            MESSAGE_PADDING * 2;
          const lineHeight = (Number(bubbleStyle.fontSize) || 9) + 2;
          const messageHeight = messageLines.length * lineHeight + MESSAGE_PADDING * 2;
          const messageBubbleX = sprite.x - messageBubbleWidth / 2;
          const messageBubbleY = y - 56 + motion - (messageLines.length - 1) * 6;
          const messageTextX = messageBubbleX + MESSAGE_PADDING;
          const messageTextY = messageBubbleY + MESSAGE_PADDING;
          const labelPaddingX = 4;
          const chipHeight = 12;
          const chipGap = 4;
          const labelY = y + 34 + motion;
          const activityBubbleSize = 18;
          const activityBubbleX = sprite.x - activityBubbleSize / 2;
          const messageBubble: MessageBubbleData = {
            show: Boolean(showGoodbye || (agent.lastMessageSnippet && isMessageFresh)),
            x: messageBubbleX,
            y: messageBubbleY,
            width: messageBubbleWidth,
            height: messageHeight,
            textX: messageTextX,
            textY: messageTextY,
            lines: messageLines,
          };
          const statusY = messageBubble.show
            ? messageBubbleY + messageHeight + 4
            : y - 28 + motion;
          const activityBubbleY = statusY;
          const activityBubble: ActivityBubbleData = {
            show: showActivity,
            x: activityBubbleX,
            y: activityBubbleY,
            size: activityBubbleSize,
            emoji: activityEmoji,
            textX: activityBubbleX + 3,
            textY: activityBubbleY + 1,
          };

          return (
            <Container
              key={agent.id}
              eventMode="static"
              cursor="pointer"
              onpointerdown={() => onSelectAgent(agent.id)}
            >
              <Graphics
                draw={(graphics: PixiGraphics) => {
                  graphics.clear();
                  graphics.beginFill(COLORS.shadow);
                  graphics.drawRect(x + 2, y + 18 + motion, 12, 4);
                  graphics.endFill();

                  if (!texture) {
                    const bodyColor = pickAvatarColor(agent);
                    graphics.beginFill(bodyColor);
                    // 32x32 Character Size (User requested 32x32)
                    graphics.drawRect(x - 8, y + motion - 8, 32, 28);
                    graphics.drawRect(x - 4, y - 20 + motion, 24, 16); // Head
                    graphics.endFill();
                    graphics.beginFill(0x13131a);
                    // Eyes
                    if (direction === "front") {
                      graphics.drawRect(x + 4, y - 12 + motion, 4, 4);
                      graphics.drawRect(x + 16, y - 12 + motion, 4, 4);
                    } else if (direction === "right") {
                      graphics.drawRect(x + 16, y - 12 + motion, 4, 4);
                    } else if (direction === "left") {
                      graphics.drawRect(x + 4, y - 12 + motion, 4, 4);
                    }
                    graphics.endFill();
                  }

                  if (isToolEvent) {
                    // Small notification square at top-right of agent
                    const notifSize = 6;
                    const notifX = sprite.x + 12;
                    const notifY = y - 24 + motion;
                    graphics.beginFill(toolRingColor, 0.95);
                    graphics.lineStyle(1, 0xffffff, 0.8);
                    graphics.drawRoundedRect(notifX, notifY, notifSize, notifSize, 1);
                    graphics.endFill();
                    graphics.lineStyle(0, 0, 0);
                  }

                  if (showEventBadge) {
                    const badgeSize = 8;
                    const badgeX = sprite.x + 10;
                    const badgeY = y - 26 + motion;
                    drawRoundedRect(
                      graphics,
                      badgeX,
                      badgeY,
                      badgeSize,
                      badgeSize,
                      2,
                      0xf1f3ff,
                      eventBadgeColor,
                      1
                    );
                  }

                  const aliasWidth =
                    TextMetrics.measureText(aliasLabel, labelStyle).width +
                    labelPaddingX * 2;
                  const aliasX = sprite.x - aliasWidth / 2; // Centered on sprite (which is center of tile)

                  drawRoundedRect(
                    graphics,
                    aliasX,
                    labelY - 10,
                    aliasWidth,
                    chipHeight,
                    6,
                    tagFill,
                    tagStroke
                  );

                  if (showTodoPulse && agent.id === todoTargetId) {
                    const badgeX = aliasX + aliasWidth + 6;
                    const badgeY = labelY - 12;
                    graphics.beginFill(0xf7f0d4);
                    graphics.lineStyle(2, 0x4a5f66, 1);
                    graphics.drawRoundedRect(badgeX, badgeY + 4, 14, 14, 3);
                    graphics.endFill();
                    graphics.beginFill(0x4a5f66);
                    graphics.drawRect(badgeX + 4, badgeY, 6, 6);
                    graphics.endFill();
                    graphics.lineStyle(0, 0, 0);
                  }

                  if (messageBubble.show) {
                    drawRoundedRect(
                      graphics,
                      messageBubble.x,
                      messageBubble.y,
                      messageBubble.width,
                      messageBubble.height,
                      4,
                      0xf1fff3,
                      0x3a5b3c,
                      1.5
                    );
                  }

                  if (activityBubble.show) {
                    drawRoundedRect(
                      graphics,
                      activityBubble.x,
                      activityBubble.y,
                      activityBubble.size,
                      activityBubble.size,
                      6,
                      0xf1f3ff,
                      0x5a6aa0,
                      1
                    );
                  }
                }}
              />
              {texture && (
                <Sprite
                  texture={texture}
                  anchor={0.5}
                  x={sprite.x}
                  y={sprite.y + motion}
                  scale={{ x: flipX * 2, y: 2 }}
                />
              )}
              <Text
                text={aliasLabel}
                anchor={0.5}
                x={x + 8}
                y={y + 30 + motion}
                style={aliasStyle}
              />
              <MessageBubble bubble={messageBubble} style={bubbleStyle} />
              <ActivityBubble bubble={activityBubble} style={activityStyle} />
            </Container>
          );
        })
      }
    </>
  );
};

export const PixiScene = (props: PixiSceneProps) => {
  const [dimensions, setDimensions] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });

  return (
    <Stage
      width={dimensions.width}
      height={dimensions.height}
      style={{ display: "block" }}
      options={{
        antialias: false,
        backgroundColor: 0x101615,
        preserveDrawingBuffer: true,
      }}
    >
      <SceneLayer
        {...props}
        sceneWidth={dimensions.width}
        sceneHeight={dimensions.height}
        setDimensions={setDimensions}
      />
    </Stage>
  );
};
