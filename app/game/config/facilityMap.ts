import type { RoomConfig, TaskStationConfig } from "../types/game.types";

// ─── Facility Map ─────────────────────────────────────────────────────────────
// 80×65 tile grid.  Rooms are separated by NARROW 4-tile-wide tunnels so
// walking between rooms feels like travelling through a corridor, not just
// crossing an open area.
//
// Layout (3 columns × left/center/right):
//   Left   x=2 …15        Corridors   x=16…31 / x=48…61      Right x=62…75
//   Center x=32…47
//
// Vertical gaps between rooms in the same column are filled with 4-wide tunnels.
// 0=void  1=dark floor  2=light floor  3=wall  4=corridor

export const MAP_COLS = 80;
export const MAP_ROWS = 65;

// ─── Rooms ────────────────────────────────────────────────────────────────────
export const ROOMS: RoomConfig[] = [
  // ── Left column ─────────────────────────────────────────────────────────────
  { id: "reactor",    name: "Reactor Core",    x: 2,  y: 2,  w: 14, h: 12, floorColor: 0x1f0f2e },
  { id: "server",     name: "Server Room",     x: 2,  y: 22, w: 14, h: 12, floorColor: 0x0f1a2a },
  { id: "security",   name: "Security",        x: 2,  y: 41, w: 14, h: 10, floorColor: 0x200d0d },
  { id: "medbay",     name: "Med Bay",         x: 2,  y: 57, w: 14, h: 7,  floorColor: 0x0d1b2e },

  // ── Center column ────────────────────────────────────────────────────────────
  { id: "cafeteria",  name: "Cafeteria",       x: 32, y: 2,  w: 16, h: 16, floorColor: 0x1c1310 },
  { id: "storage",    name: "Data Vault",      x: 32, y: 26, w: 16, h: 12, floorColor: 0x0c0a09 },
  { id: "admin",      name: "Admin",           x: 32, y: 47, w: 16, h: 16, floorColor: 0x0d1a30 },

  // ── Right column ─────────────────────────────────────────────────────────────
  { id: "weapons",    name: "Weapons Bay",     x: 62, y: 2,  w: 14, h: 12, floorColor: 0x2d0808 },
  { id: "shields",    name: "Shield Control",  x: 62, y: 22, w: 14, h: 12, floorColor: 0x081d10 },
  { id: "navigation", name: "Navigation",      x: 62, y: 41, w: 14, h: 10, floorColor: 0x0a1020 },
  { id: "comms",      name: "Comms Hub",       x: 62, y: 57, w: 14, h: 7,  floorColor: 0x151020 },
];

// ─── Corridors ────────────────────────────────────────────────────────────────
// All tunnels are exactly 4 tiles wide so they feel like a narrow passage.
// Vertical tunnels run between room gaps; horizontal tunnels cross between columns.
interface Corridor { x: number; y: number; w: number; h: number; }

export const CORRIDORS: Corridor[] = [
  // ── Left column — vertical tunnels ───────────────────────────────────────────
  { x: 6,  y: 14, w: 4, h: 8  }, // reactor  (ends y=14) → server   (starts y=22)
  { x: 6,  y: 34, w: 4, h: 7  }, // server   (ends y=34) → security (starts y=41)
  { x: 6,  y: 51, w: 4, h: 6  }, // security (ends y=51) → medbay   (starts y=57)

  // ── Center column — vertical tunnels ─────────────────────────────────────────
  { x: 37, y: 18, w: 4, h: 8  }, // cafeteria (ends y=18) → storage (starts y=26)
  { x: 37, y: 38, w: 4, h: 9  }, // storage   (ends y=38) → admin   (starts y=47)

  // ── Right column — vertical tunnels ──────────────────────────────────────────
  { x: 66, y: 14, w: 4, h: 8  }, // weapons   → shields
  { x: 66, y: 34, w: 4, h: 7  }, // shields   → navigation
  { x: 66, y: 51, w: 4, h: 6  }, // navigation→ comms

  // ── Left ↔ Center — horizontal tunnels (h=4 each) ────────────────────────────
  { x: 16, y: 6,  w: 16, h: 4 }, // reactor   ↔ cafeteria
  { x: 16, y: 28, w: 16, h: 4 }, // server    ↔ storage
  { x: 16, y: 57, w: 16, h: 4 }, // medbay    ↔ admin

  // ── Center ↔ Right — horizontal tunnels (h=4 each) ───────────────────────────
  { x: 48, y: 6,  w: 14, h: 4 }, // cafeteria ↔ weapons
  { x: 48, y: 28, w: 14, h: 4 }, // storage   ↔ shields
  { x: 48, y: 57, w: 14, h: 4 }, // admin     ↔ comms
];

// ─── Task Stations ────────────────────────────────────────────────────────────
export const TASK_STATIONS: TaskStationConfig[] = [
  { id: "coolant",   tileX: 8,  tileY: 7,  label: "Fix Coolant",    room: "reactor",    icon: "*" },
  { id: "plasma",    tileX: 11, tileY: 11, label: "Plasma Balance", room: "reactor",    icon: "+" },
  { id: "reboot",    tileX: 8,  tileY: 27, label: "Reboot Server",  room: "server",     icon: ">" },
  { id: "firewall",  tileX: 11, tileY: 31, label: "Patch Firewall", room: "server",     icon: "#" },
  { id: "lockdown",  tileX: 8,  tileY: 46, label: "Lockdown Codes", room: "security",   icon: "@" },
  { id: "scan",      tileX: 8,  tileY: 61, label: "Bio Scan",       room: "medbay",     icon: "+" },
  { id: "swipe",     tileX: 37, tileY: 7,  label: "Swipe Card",     room: "cafeteria",  icon: ">" },
  { id: "wires",     tileX: 42, tileY: 14, label: "Fix Wires",      room: "cafeteria",  icon: "#" },
  { id: "upload",    tileX: 37, tileY: 31, label: "Upload Data",    room: "storage",    icon: "@" },
  { id: "chartmap",  tileX: 37, tileY: 52, label: "Chart Course",   room: "admin",      icon: ">" },
  { id: "vote",      tileX: 42, tileY: 59, label: "Cast Vote",      room: "admin",      icon: "*" },
  { id: "calibrate", tileX: 66, tileY: 7,  label: "Calibrate Guns", room: "weapons",    icon: "+" },
  { id: "shields2",  tileX: 66, tileY: 27, label: "Prime Shields",  room: "shields",    icon: "#" },
  { id: "navroute",  tileX: 66, tileY: 46, label: "Plot Route",     room: "navigation", icon: "@" },
  { id: "divert",    tileX: 66, tileY: 61, label: "Divert Power",   room: "comms",      icon: ">" },
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
      if (map[r][cor.x]             === 3) map[r][cor.x]             = 4;
      if (map[r][cor.x + cor.w - 1] === 3) map[r][cor.x + cor.w - 1] = 4;
    }
    for (let c = cor.x + 1; c < cor.x + cor.w - 1; c++) {
      if (map[cor.y][c]             === 3) map[cor.y][c]             = 4;
      if (map[cor.y + cor.h - 1][c] === 3) map[cor.y + cor.h - 1][c] = 4;
    }
  }

  return map;
}
