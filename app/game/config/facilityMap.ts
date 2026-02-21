import type { RoomConfig, TaskStationConfig } from "../types/game.types";

// ─── Facility Map ─────────────────────────────────────────────────────────────
// 3 themed zones, each 16×16 tiles, connected by 8-tile-wide bridges.
//
// Layout (left → right):
//   [Code Lab]  ──bridge──  [Cafeteria]  ──bridge──  [Debug Room]
//
// 0=void  1=dark floor  2=light floor  3=wall  4=corridor

export const MAP_COLS = 72;
export const MAP_ROWS = 24;

// ─── Rooms ────────────────────────────────────────────────────────────────────
export const ROOMS: RoomConfig[] = [
  // Zone 1 — Code Lab (left)
  { id: "codelab", name: "Code Lab", x: 2, y: 4, w: 16, h: 16, floorColor: 0x0c1628 },
  // Zone 2 — Cafeteria (center, spawn)
  { id: "cafeteria", name: "Cafeteria", x: 28, y: 4, w: 16, h: 16, floorColor: 0x1a1510 },
  // Zone 3 — Debug Room (right)
  { id: "debugroom", name: "Debug Room", x: 54, y: 4, w: 16, h: 16, floorColor: 0x140c1e },
];

// ─── Bridges ──────────────────────────────────────────────────────────────────
// 8 tiles wide, connecting rooms horizontally through the middle
interface Corridor { x: number; y: number; w: number; h: number; }

export const CORRIDORS: Corridor[] = [
  // Code Lab → Cafeteria  (y centered in rooms: room.y + 6, height 4)
  { x: 18, y: 10, w: 10, h: 4 },
  // Cafeteria → Debug Room
  { x: 44, y: 10, w: 10, h: 4 },
];

// ─── Task Stations ────────────────────────────────────────────────────────────
export const TASK_STATIONS: TaskStationConfig[] = [
  // Code Lab — coding challenges
  { id: "compile", tileX: 6, tileY: 8, label: "Compile Code", room: "codelab", icon: ">" },
  { id: "debug_var", tileX: 12, tileY: 14, label: "Fix Variables", room: "codelab", icon: "#" },

  // Cafeteria — general tasks
  { id: "swipe", tileX: 33, tileY: 8, label: "Swipe Card", room: "cafeteria", icon: "*" },
  { id: "wires", tileX: 38, tileY: 14, label: "Fix Wires", room: "cafeteria", icon: "+" },

  // Debug Room — debugging challenges
  { id: "stacktrc", tileX: 59, tileY: 8, label: "Read Stack Trace", room: "debugroom", icon: "@" },
  { id: "memleak", tileX: 65, tileY: 14, label: "Fix Memory Leak", room: "debugroom", icon: "!" },
];

// ─── Map Generator ────────────────────────────────────────────────────────────
export function generateFacilityMap(): number[][] {
  const map: number[][] = Array.from({ length: MAP_ROWS }, () =>
    new Array(MAP_COLS).fill(0),
  );

  // ── Rooms ──
  for (const room of ROOMS) {
    for (let r = room.y; r < room.y + room.h; r++) {
      for (let c = room.x; c < room.x + room.w; c++) {
        const isWall =
          r === room.y || r === room.y + room.h - 1 ||
          c === room.x || c === room.x + room.w - 1;
        map[r][c] = isWall ? 3 : ((r + c) % 2 === 0 ? 1 : 2);
      }
    }
  }

  // ── Corridors ──
  for (const cor of CORRIDORS) {
    for (let r = cor.y; r < cor.y + cor.h; r++) {
      for (let c = cor.x; c < cor.x + cor.w; c++) {
        if (r < 0 || r >= MAP_ROWS || c < 0 || c >= MAP_COLS) continue;
        const isEdge =
          r === cor.y || r === cor.y + cor.h - 1 ||
          c === cor.x || c === cor.x + cor.w - 1;
        if (isEdge) {
          if (map[r][c] === 0) map[r][c] = 3;
        } else {
          map[r][c] = 4;
        }
      }
    }
  }

  // ── Punch doorways where corridors meet room walls ──
  for (const cor of CORRIDORS) {
    for (let r = cor.y + 1; r < cor.y + cor.h - 1; r++) {
      if (map[r][cor.x] === 3) map[r][cor.x] = 4;
      if (map[r][cor.x + cor.w - 1] === 3) map[r][cor.x + cor.w - 1] = 4;
    }
    for (let c = cor.x + 1; c < cor.x + cor.w - 1; c++) {
      if (map[cor.y][c] === 3) map[cor.y][c] = 4;
      if (map[cor.y + cor.h - 1][c] === 3) map[cor.y + cor.h - 1][c] = 4;
    }
  }

  return map;
}
