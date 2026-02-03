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
import { drawRoundedRect } from "./components/pixi/drawRoundedRect";

settings.SCALE_MODE = SCALE_MODES.NEAREST;
settings.ROUND_PIXELS = true;

type SpriteState = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  homeTile: { row: number; col: number };
  direction: "front" | "back" | "left" | "right";
  exiting?: boolean;
  exitAt?: number;
  goodbyeUntil?: number;
  removeAt?: number;
};

type RenderableItem = { type: "agent"; id: string; y: number };

type DirectionFrames = {
  right: Texture[];
  down: Texture[];
  up: Texture[];
};

type SpriteSheets = {
  idle?: DirectionFrames;
  walk?: DirectionFrames;
  run?: DirectionFrames;
  jump?: DirectionFrames;
};

type PixiSceneProps = {
  agents: Agent[];
  interactions: Interaction[];
  sessions: SessionInfo[];
  activeSessionId: string | null;
  lastTodoSummary: TodoSummary | null;
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
};

const TILE = 36;
const WIDTH = 960;
const HEIGHT = 540;
const MAP_COLS = Math.floor(WIDTH / TILE);
const MAP_ROWS = Math.floor(HEIGHT / TILE);
const MEETING_ROOM = {
  rowStart: 2,
  rowEnd: 5,
  colStart: 18,
  colEnd: 23,
};

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

const OFFICE_AREA = {
  colStart: 1,
  colEnd: 24,
  rowStart: 1,
  rowEnd: 12,
};

const DESK_LAYOUT = {
  rows: 3,
  cols: 4,
  origin: { col: 3, row: 4 },
  colStep: 3,
  rowStep: 3,
};

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

const buildDeskTiles = () => {
  const tiles = [] as { row: number; col: number; index: number }[];
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

const buildTileMap = (deskTiles: { row: number; col: number }[]) => {
  const map = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => "grass")
  );

  for (let row = OFFICE_AREA.rowStart; row <= OFFICE_AREA.rowEnd; row += 1) {
    for (let col = OFFICE_AREA.colStart; col <= OFFICE_AREA.colEnd; col += 1) {
      map[row][col] = "floor";
    }
  }

  for (let col = OFFICE_AREA.colStart; col <= OFFICE_AREA.colEnd; col += 1) {
    map[OFFICE_AREA.rowStart][col] = "wall_face";
    map[OFFICE_AREA.rowEnd][col] = "partition_h_top";
  }
  for (let row = OFFICE_AREA.rowStart; row <= OFFICE_AREA.rowEnd; row += 1) {
    map[row][OFFICE_AREA.colStart] = "partition_v_right";
    map[row][OFFICE_AREA.colEnd] = "partition_v_left";
  }
  // Rounded Corners
  map[OFFICE_AREA.rowEnd][OFFICE_AREA.colStart] = "corner_bl";
  map[OFFICE_AREA.rowEnd][OFFICE_AREA.colEnd] = "corner_br";

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

  // Add Bookshelves
  map[OFFICE_AREA.rowStart][OFFICE_AREA.colStart + 1] = "bookshelf";
  map[OFFICE_AREA.rowStart][OFFICE_AREA.colEnd - 1] = "bookshelf";
  map[OFFICE_AREA.rowStart][OFFICE_AREA.colStart + 5] = "bookshelf";
  map[OFFICE_AREA.rowStart][OFFICE_AREA.colEnd - 5] = "bookshelf";

  const partitionRows = [3, 6, 9];
  partitionRows.forEach((pRow) => {
    if (pRow > OFFICE_AREA.rowStart && pRow < OFFICE_AREA.rowEnd) {
      for (let col = 3; col <= 11; col += 1) {
        if (map[pRow][col] === "floor") {
          map[pRow][col] = "wall_face"; // Interior partitions use same face style
        }
      }
    }
  });

  const partitionCols = [7, 11];
  partitionCols.forEach((pCol) => {
    for (let row = 3; row <= 10; row += 1) {
      if (map[row][pCol] === "floor") {
        map[row][pCol] = "partition_v";
      }
    }
  });

  deskTiles.forEach((tile) => {
    map[tile.row][tile.col] = "desk";
  });

  for (let row = MEETING_ROOM.rowStart; row <= MEETING_ROOM.rowEnd; row += 1) {
    for (let col = MEETING_ROOM.colStart; col <= MEETING_ROOM.colEnd; col += 1) {
      map[row][col] = "carpet";
    }
  }
  for (let col = MEETING_ROOM.colStart; col <= MEETING_ROOM.colEnd; col += 1) {
    map[MEETING_ROOM.rowEnd][col] = "partition_h_top";
  }
  for (let row = MEETING_ROOM.rowStart; row <= MEETING_ROOM.rowEnd; row += 1) {
    map[row][MEETING_ROOM.colStart] = "partition_v"; // Interior vertical wall
  }
  map[MEETING_ROOM.rowEnd][MEETING_ROOM.colStart] = "corner_bl"; // Corner for meeting room
  map[3][20] = "table";
  map[3][21] = "table";
  map[4][20] = "table";
  map[4][21] = "table";

  const plants = [
    { row: 2, col: 2 },
    { row: 2, col: 17 },
    { row: 11, col: 2 },
    { row: 7, col: 23 },
    { row: 11, col: 16 },
  ];
  plants.forEach((plant) => {
    map[plant.row][plant.col] = "plant";
  });

  map[6][15] = "cooler";

  return map;
};

const deskTiles = buildDeskTiles();
const tileMap = buildTileMap(deskTiles);

const isWalkable = (col: number, row: number) => {
  if (col < 0 || row < 0 || col >= MAP_COLS || row >= MAP_ROWS) {
    return false;
  }
  const type = tileMap[row][col];
  return type === "grass" || type === "floor" || type === "path";
};

const walkableTiles = (() => {
  const tiles: { col: number; row: number }[] = [];
  for (let row = 0; row < MAP_ROWS; row += 1) {
    for (let col = 0; col < MAP_COLS; col += 1) {
      if (isWalkable(col, row)) {
        tiles.push({ col, row });
      }
    }
  }
  return tiles;
})();

const tileToPixel = (tile: { col: number; row: number }) => ({
  x: tile.col * TILE + TILE / 2,
  y: tile.row * TILE + TILE / 2,
});

const pickRandomWalkable = () =>
  walkableTiles[Math.floor(Math.random() * walkableTiles.length)];

const pickWanderTile = (homeTile: { row: number; col: number }, radius: number) => {
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

const doorTile = () => {
  const doorCol = Math.floor((OFFICE_AREA.colStart + OFFICE_AREA.colEnd) / 2);
  return { row: OFFICE_AREA.rowEnd + 1, col: doorCol };
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
  status === "working" || status === "thinking";

const pickAvatarColor = (agent: Agent) => {
  const id = agent.id || "";
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 997;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
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
      drawRect("#b7de7c", 0, 0, TILE, 2);
      drawRect("#8bb85f", 0, TILE - 6, TILE, 6);
      drawRect("#7aa44f", 0, TILE - 2, TILE, 2);
      drawRect("#96c86a", 4, 4, 4, 4);
      drawRect("#96c86a", 18, 12, 4, 4);
      break;
    case "path":
      drawRect("#d4c4a8", 0, 0, TILE, TILE);
      drawRect("#e4d7bf", 0, 0, TILE, 2);
      drawRect("#bfae94", 0, TILE - 5, TILE, 5);
      drawRect("#ac9b82", 0, TILE - 2, TILE, 2);
      drawRect("#c9b89e", 6, 6, 4, 4);
      drawRect("#c9b89e", 20, 14, 4, 4);
      break;
    case "floor":
      drawRect("#e8dcc8", 0, 0, TILE, TILE);
      drawRect("#f3ead9", 0, 0, TILE, 2);
      drawRect("#d9ccb5", 0, TILE - 2, TILE, 2);
      drawRect("#c7b59f", 0, TILE - 1, TILE, 1);
      drawRect("#f0e6d6", 2, 2, 2, 2);
      drawRect("#f0e6d6", 18, 18, 2, 2);
      break;
    case "wall_face":
      // Top Cap (Partition style) - Height 10
      drawRect("#4a4a5c", 0, 0, TILE, 10);
      drawRect("#5a5a6e", 0, 0, TILE, 2);
      drawRect("#3a3a4a", 0, 8, TILE, 2);

      // Wall Face - Middle
      drawRect("#6e6e82", 0, 10, TILE, TILE - 14);

      // Baseboard - Bottom 4
      drawRect("#4a4a5c", 0, TILE - 4, TILE, 4);
      break;
    case "partition_h":
    case "partition_h_top":
      // Thin horizontal partition strip
      if (type === "partition_h") {
        drawRect("#e8dcc8", 0, 0, TILE, TILE); // Floor Background for internal
      } else {
        // partition_h_top: Wall at top, Void below
        // Wall is 0..12. Void is 12..32
        drawRect("#121212", 0, 12, TILE, TILE - 12);
      }

      const phH = 12;
      const phY = type === "partition_h_top" ? 0 : (TILE - phH) / 2;

      drawRect("#4a4a5c", 0, phY, TILE, phH); // Dark base
      drawRect("#5a5a6e", 0, phY + 2, TILE, phH - 4); // Lighter top surface
      drawRect("#3a3a4a", 0, phY + phH - 2, TILE, 2); // Shadow on bottom
      break;
    case "partition_v":
    case "partition_v_left":
    case "partition_v_right":
      // Thin vertical partition strip
      const pvW = 12;
      let pvX = (TILE - pvW) / 2;
      if (type === "partition_v_left") pvX = 0;
      if (type === "partition_v_right") pvX = TILE - pvW;

      if (type === "partition_v") {
        drawRect("#e8dcc8", 0, 0, TILE, TILE); // Floor Background for internal
      } else if (type === "partition_v_left") {
        // Wall at Left (0..12). Void at Right (12..32)
        drawRect("#121212", 12, 0, TILE - 12, TILE);
      } else if (type === "partition_v_right") {
        // Wall at Right (20..32). Void at Left (0..20)
        drawRect("#121212", 0, 0, TILE - 12, TILE);
      }

      drawRect("#4a4a5c", pvX, 0, pvW, TILE); // Dark base
      drawRect("#5a5a6e", pvX + 2, 0, pvW - 4, TILE); // Lighter top surface
      drawRect("#3a3a4a", pvX + pvW - 2, 0, 2, TILE); // Shadow on right
      break;
    case "corner_bl":
      // Bottom-Left Rounded Corner
      // Meets 'partition_v_right' (West wall, wall at right) and 'partition_h_top' (South wall, wall at top)
      // Corner is Top-Right of this tile
      {
        const w = 12;
        const r = 12;
        // Draw Arc
        ctx.beginPath();
        ctx.moveTo(TILE, w);
        ctx.arc(TILE, 0, TILE - (TILE - w), Math.PI / 2, Math.PI); // Incorrect math?
        // Simpler: Draw 2 rectangles and use arc for the join?
        // Draw Top Horiz Part
        drawRect("#4a4a5c", TILE - w, 0, w, w); // Fill corner square first

        // We want a curve from (TILE-12, something) to (something, 12).
        // Let's just make it a sharp corner for now to ensure alignment, 
        // then round it if requested strictly. User said "make it rounded".
        // Okay, let's try a proper rounded path.
        ctx.clearRect(0, 0, TILE, TILE); // Clear
        ctx.fillStyle = "#121212"; // Void
        ctx.fillRect(0, 0, TILE, TILE);

        ctx.fillStyle = "#4a4a5c";
        ctx.beginPath();
        ctx.moveTo(TILE, 0);
        ctx.lineTo(TILE, 12);
        ctx.arcTo(TILE - 12, 12, TILE - 12, 0, 12); // Inner curve?
        ctx.lineTo(TILE - 12, 0);
        ctx.fill();

        // Proper Rounded Corner Logic:
        // Connect Vertical (x=24..36) to Horizontal (y=0..12)
        // Outer corner is (36,0) [Top Right of tile]
        // Inner corner is (24,12)

        // Outer Arc (Radius 12) centered at (24, 0)?
        // If center is (24,0), radius 12 goes from (36,0) to (24,12). That's an arc.
        ctx.beginPath();
        ctx.moveTo(TILE, 0); // Start at Top Right
        ctx.arc(TILE - 12, 0, 12, 0, Math.PI / 2); // Arc to (24, 12)
        ctx.lineTo(TILE - 12, 0); // Close to center
        ctx.fill();

        // Highlight
        ctx.fillStyle = "#5a5a6e";
        ctx.beginPath();
        ctx.moveTo(TILE, 0);
        ctx.arc(TILE - 12, 0, 10, 0, Math.PI / 2);
        ctx.lineTo(TILE - 12, 0);
        ctx.fill();
      }
      break;
    case "corner_br":
      // Bottom-Right Rounded Corner
      // Meets 'partition_v_left' (East wall, wall at left) and 'partition_h_top' (South wall, wall at top)
      // Intersection is Top-Left of this tile (0,0) to (12,12)
      {
        ctx.fillStyle = "#4a4a5c";
        ctx.beginPath();
        ctx.moveTo(0, 0); // Top Left
        // Center at (12, 0)
        ctx.arc(12, 0, 12, Math.PI, Math.PI / 2, true); // Arc from (0,0) to (12, 12) ??
        // Arc angles: 0 is Right. PI is Left. PI/2 is Down.
        // We want arc from Left (0,0) -> Down (12,12).
        // Center (12,0). radius 12.
        // Angle PI (at x=0) to PI/2 (at y=12).
        ctx.arc(12, 0, 12, Math.PI, Math.PI / 2, true);
        ctx.lineTo(12, 0);
        ctx.fill();

        // Highlight
        ctx.fillStyle = "#5a5a6e";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(12, 0, 10, Math.PI, Math.PI / 2, true);
        ctx.lineTo(12, 0);
        ctx.fill();
      }
      break;
    case "window":
      // Sits on top of wall_h, so replicate wall bg
      drawRect("#4a4a5c", 0, 0, TILE, 10);
      drawRect("#5a5a6e", 0, 0, TILE, 2);
      drawRect("#3a3a4a", 0, 8, TILE, 2);
      drawRect("#6e6e82", 0, 10, TILE, TILE - 14);
      drawRect("#4a4a5c", 0, TILE - 4, TILE, 4);

      // Window Glass
      drawRect("#a8d8ea", 6, 6, TILE - 12, TILE - 16);
      drawRect("#c5e8f5", 8, 8, TILE - 18, 3);
      drawRect("#8faab5", 6, 6, TILE - 12, 1); // Frame top
      drawRect("#8faab5", 6, TILE - 10, TILE - 12, 1); // Frame bottom
      break;
    case "desk":
      drawRect("#e8dcc8", 0, 0, TILE, TILE); // Floor

      // Exaggerated 3D Desk
      const dTopH = 22; // Deeper Top
      drawRect("#8d6b4f", 2, 2, TILE - 4, dTopH); // Main Top
      drawRect("#a6856a", 2, 2, TILE - 4, 3); // Back highlight edge

      // Front Face (Shifted down)
      drawRect("#75543d", 2, 2 + dTopH, TILE - 4, 6); // Short front panel

      // Legs
      drawRect("#5c4330", 2, 2 + dTopH, 3, 8); // Left
      drawRect("#5c4330", TILE - 5, 2 + dTopH, 3, 8); // Right

      // Large Monitor
      // Stand
      drawRect("#1a1a1a", 14, 8, 4, 6);
      drawRect("#1a1a1a", 12, 14, 8, 2); // Base

      // Screen (Floating high)
      drawRect("#1a1a1a", 6, 2, 20, 12); // Bezel
      drawRect("#2b2b3b", 8, 4, 16, 8); // Screen Off dark
      drawRect("#4a90e2", 10, 5, 4, 4); // "On" reflection/glare

      // Papers
      drawRect("#f0f0f0", 4, 18, 5, 5);
      break;
    case "table":
      drawRect("#e8dcc8", 0, 0, TILE, TILE); // Floor

      // Exaggerated 3D Table
      const tTopH = 20;
      drawRect("#8d6b4f", 4, 4, TILE - 8, tTopH);
      drawRect("#a6856a", 6, 6, TILE - 12, tTopH - 6);

      // Front Face
      drawRect("#5c4330", 4, 4 + tTopH, TILE - 8, 4);

      // Legs
      drawRect("#3e2b1e", 6, 4 + tTopH + 2, 3, 6);
      drawRect("#3e2b1e", TILE - 9, 4 + tTopH + 2, 3, 6);
      break;
    case "bookshelf":
      // Wall Background
      drawRect("#4a4a5c", 0, 0, TILE, 10);
      drawRect("#6e6e82", 0, 10, TILE, TILE - 14);
      drawRect("#4a4a5c", 0, TILE - 4, TILE, 4);

      // Deep Top Cap + Shelf Face
      const bsY = 4; // Higher up
      const bsTopH = 8; // Visible top depth
      const bsW = TILE - 6;
      const bsX = 3;

      // Top Surface
      drawRect("#5c4330", bsX, bsY, bsW, bsTopH);
      drawRect("#75543d", bsX, bsY, bsW, 2); // Highlight

      // Front Face (Shelves) - Starts below top
      const shelfY = bsY + bsTopH;
      const shelfH = TILE - shelfY - 2;
      drawRect("#3e2b1e", bsX, shelfY, bsW, shelfH); // Inner shadow

      // Shelves
      drawRect("#8d6b4f", bsX + 2, shelfY + 6, bsW - 4, 2);
      drawRect("#8d6b4f", bsX + 2, shelfY + 14, bsW - 4, 2);

      // Books
      const bsBooks = ["#a83232", "#32a852", "#3262a8", "#a8a832", "#a832a8"];
      for (let i = 0; i < 4; i++) {
        drawRect(bsBooks[i % bsBooks.length], bsX + 4 + i * 5, shelfY + 1, 3, 5);
        drawRect(bsBooks[(i + 2) % bsBooks.length], bsX + 4 + i * 5, shelfY + 9, 3, 5);
      }
      break;
    case "carpet":
      drawRect("#6b8e9f", 0, 0, TILE, TILE);
      drawRect("#7fa5b7", 0, 0, TILE, 2);
      drawRect("#5a7d8e", 0, TILE - 4, TILE, 4);
      drawRect("#4e6d7c", 0, TILE - 2, TILE, 2);
      drawRect("#7a9eb0", 4, 4, 3, 3);
      drawRect("#7a9eb0", 20, 16, 3, 3);
      break;
    case "plant":
      drawRect("#e8dcc8", 0, 0, TILE, TILE);
      drawRect("#6b4423", 12, 20, 12, 10);
      drawRect("#7d5530", 12, 20, 12, 2);
      drawRect("#3a8a4d", 8, 8, 20, 14);
      drawRect("#5cb86c", 12, 10, 6, 6);
      drawRect("#2d7040", 18, 12, 4, 4);
      break;
    case "cooler":
      drawRect("#e8dcc8", 0, 0, TILE, TILE);
      drawRect("#d0d8e0", 10, 8, 16, 22);
      drawRect("#e8f0f5", 10, 8, 16, 2);
      drawRect("#e8f0f5", 12, 10, 12, 8);
      drawRect("#4a90b8", 14, 12, 8, 4);
      break;
    default:
      drawRect("#a8d070", 0, 0, TILE, TILE);
  }
  const texture = Texture.from(canvas);
  texture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
  return texture;
};
const TitleBadge = ({ x, y }: { x: number; y: number }) => {
  const titleText = "OpenCode Office";
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

const SceneLayer = ({
  agents,
  interactions,
  sessions,
  activeSessionId,
  lastTodoSummary,
  selectedAgentId,
  onSelectAgent,
}: PixiSceneProps) => {
  const [frame, setFrame] = useState(0);
  const timeRef = useRef(0);
  const spritesRef = useRef<Map<string, SpriteState>>(new Map());
  const agentCacheRef = useRef<Map<string, Agent>>(new Map());
  const [spriteSheets, setSpriteSheets] = useState<SpriteSheets>({});
  const tileTextures = useMemo(() => {
    const types = [
      "grass",
      "path",
      "floor",
      "wall_face",
      "partition_h",
      "partition_h_top",
      "partition_v",
      "partition_v_left",
      "partition_v_right",
      "corner_bl",
      "corner_br",
      "window",
      "desk",
      "table",
      "carpet",
      "plant",
      "bookshelf",
      "cooler",
    ];
    const textures: Record<string, Texture | null> = {};
    types.forEach((type) => {
      textures[type] = buildTileTexture(type);
    });
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
    agents.forEach((agent) => {
      agentCache.set(agent.id, agent);
    });
    for (const id of spriteMap.keys()) {
      if (!ids.has(id)) {
        const existing = spriteMap.get(id);
        if (existing && !existing.exiting) {
          const exitTarget = tileToPixel(doorTile());
          spriteMap.set(id, {
            ...existing,
            exiting: true,
            exitAt: now,
            goodbyeUntil: now + GOODBYE_TTL_MS,
            removeAt: now + EXIT_TTL_MS,
            targetX: exitTarget.x,
            targetY: exitTarget.y,
            direction: "front",
          });
        }
      }
    }
    agents.forEach((agent) => {
      if (spriteMap.has(agent.id)) {
        return;
      }
      const row = agent?.desk?.row ?? 0;
      const col = agent?.desk?.column ?? 0;
      const index = row * DESK_LAYOUT.cols + col;
      const deskTile = deskTiles[index % deskTiles.length] || deskTiles[0];
      const position = tileToPixel(deskTile);
      spriteMap.set(agent.id, {
        x: position.x,
        y: position.y,
        targetX: position.x,
        targetY: position.y,
        homeTile: { row: deskTile.row, col: deskTile.col },
        direction: "front",
      });
    });
  }, [agents]);

  useTick((delta: number) => {
    timeRef.current += delta * 16;
    const spriteMap = spritesRef.current;
    const agentCache = agentCacheRef.current;
    const agentIds = new Set(agents.map((agent) => agent.id));
    agents.forEach((agent) => {
      const sprite = spriteMap.get(agent.id);
      if (!sprite) {
        return;
      }
      const deskTarget = tileToPixel(sprite.homeTile);
      if (shouldBeAtDesk(agent.status || "working")) {
        const targetDistance = Math.hypot(
          sprite.targetX - deskTarget.x,
          sprite.targetY - deskTarget.y
        );
        if (targetDistance > 1) {
          sprite.targetX = deskTarget.x;
          sprite.targetY = deskTarget.y;
        }
      }

      const dx = sprite.targetX - sprite.x;
      const dy = sprite.targetY - sprite.y;
      const distance = Math.hypot(dx, dy);
      const speed = statusSpeed(agent.status || "working");

      if (distance > 0.1) {
        const step = Math.min(speed, distance);
        sprite.x += (dx / distance) * step;
        sprite.y += (dy / distance) * step;
        if (Math.abs(dx) > Math.abs(dy)) {
          sprite.direction = dx > 0 ? "right" : "left";
        } else {
          sprite.direction = dy > 0 ? "front" : "back";
        }
      } else if (shouldBeAtDesk(agent.status || "working")) {
        sprite.direction = "back";
      } else {
        sprite.direction = "front";
      }

      if (distance < 1) {
        if (shouldBeAtDesk(agent.status || "working")) {
          sprite.targetX = deskTarget.x;
          sprite.targetY = deskTarget.y;
        } else {
          const radius = statusRadius(agent.status || "idle");
          const targetTile = pickWanderTile(sprite.homeTile, radius);
          const target = tileToPixel(targetTile);
          sprite.targetX = target.x;
          sprite.targetY = target.y;
        }
      }
    });
    const exitTarget = tileToPixel(doorTile());
    for (const [id, sprite] of spriteMap.entries()) {
      if (!sprite.exiting || agentIds.has(id)) {
        continue;
      }
      const dx = sprite.targetX - sprite.x;
      const dy = sprite.targetY - sprite.y;
      const distance = Math.hypot(dx, dy);
      const step = Math.min(0.85, distance);
      if (distance > 0.1) {
        sprite.x += (dx / distance) * step;
        sprite.y += (dy / distance) * step;
      }
      sprite.direction = dy > 0 ? "front" : "back";
      if (!sprite.exitAt) {
        sprite.exitAt = Date.now();
      }
      if (
        distance < 1 &&
        (!sprite.goodbyeUntil || Date.now() > sprite.goodbyeUntil) &&
        (sprite.removeAt && Date.now() > sprite.removeAt)
      ) {
        spriteMap.delete(id);
        agentCache.delete(id);
      } else if (Math.hypot(sprite.targetX - exitTarget.x, sprite.targetY - exitTarget.y) > 1) {
        sprite.targetX = exitTarget.x;
        sprite.targetY = exitTarget.y;
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
        {tileMap.map((row, rowIndex) =>
          row.map((type, colIndex) => {
            const texture = tileTextures[type] || tileTextures.grass;
            if (!texture) {
              return null;
            }
            const position = tileToPixel({ col: colIndex, row: rowIndex });
            return (
              <Sprite
                key={`tile-${rowIndex}-${colIndex}`}
                texture={texture}
                x={colIndex * TILE}
                y={rowIndex * TILE}
              />
            );
          })
        )}
      </Container>
      <TitleBadge x={8} y={8} />
      <Graphics
        draw={(graphics: PixiGraphics) => {
          graphics.clear();
          if (activeSession && activeStatus) {
            const lampX = MEETING_ROOM.colEnd * TILE + TILE - 14;
            const lampY = MEETING_ROOM.rowStart * TILE + 6;
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
          if (!showTodoPulse) {
            return;
          }
          const baseX = 154;
          const baseY = 8;
          graphics.beginFill(0xf7f0d4);
          graphics.lineStyle(2, 0x4a5f66, 1);
          graphics.drawRoundedRect(baseX, baseY + 4, 16, 16, 3);
          graphics.endFill();
          graphics.beginFill(0x4a5f66);
          graphics.drawRect(baseX + 5, baseY, 6, 6);
          graphics.endFill();
          graphics.lineStyle(0, 0, 0);
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
      {renderList.map((item) => {
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
        const state = agent.status === "thinking" ? "jump" : isRunning ? "run" : isWalking ? "walk" : "idle";
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
        const activityEmoji =
          hasRecentEdit
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
        const labelY = y + 26 + motion;
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
                  graphics.drawRect(x, y + motion, 16, 14);
                  graphics.drawRect(x + 2, y - 6 + motion, 12, 8);
                  graphics.endFill();
                  graphics.beginFill(0x13131a);
                  if (direction === "front") {
                    graphics.drawRect(x + 4, y - 2 + motion, 2, 2);
                    graphics.drawRect(x + 10, y - 2 + motion, 2, 2);
                  } else if (direction === "right") {
                    graphics.drawRect(x + 10, y - 2 + motion, 2, 2);
                  } else if (direction === "left") {
                    graphics.drawRect(x + 4, y - 2 + motion, 2, 2);
                  }
                  graphics.endFill();
                }

                if (isToolEvent) {
                  graphics.lineStyle(2, toolRingColor, 0.9);
                  graphics.drawCircle(sprite.x, y + motion + 2, 12);
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
                const aliasX = x + 8 - aliasWidth / 2;

                drawRoundedRect(
                  graphics,
                  aliasX,
                  labelY - 10,
                  aliasWidth,
                  chipHeight,
                  6,
                  0x2b5a3c,
                  0x73d28f
                );

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
                scale={{ x: flipX, y: 1 }}
              />
            )}
            <Text
              text={aliasLabel}
              anchor={0.5}
              x={x + 8}
              y={y + 22 + motion}
              style={aliasStyle}
            />
            <MessageBubble bubble={messageBubble} style={bubbleStyle} />
            <ActivityBubble bubble={activityBubble} style={activityStyle} />
          </Container>
        );
      })}
    </>
  );
};

export const PixiScene = (props: PixiSceneProps) => (
  <Stage
    width={WIDTH}
    height={HEIGHT}
    style={{ width: "100%", height: "auto", display: "block" }}
    options={{
      antialias: false,
      backgroundColor: 0x101615,
      preserveDrawingBuffer: true,
    }}
  >
    <SceneLayer {...props} />
  </Stage>
);
