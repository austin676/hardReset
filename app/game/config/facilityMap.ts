import type { MapConfig, TileType } from "../types/game.types";

// ─── Facility Maps ────────────────────────────────────────────
// Each map is 16×16 tiles.
// 0=wall  1=floor  2=portal  3=task spot

// Helper: create a 16×16 grid filled with walls, then carve an interior
function makeRoom(): TileType[][] {
  const g: TileType[][] = [];
  for (let r = 0; r < 16; r++) {
    const row: TileType[] = [];
    for (let c = 0; c < 16; c++) {
      const isWall = r === 0 || r === 15 || c === 0 || c === 15;
      row.push(isWall ? 0 : 1);
    }
    g.push(row);
  }
  return g;
}

// Punch a portal hole in the wall
function setTile(grid: TileType[][], r: number, c: number, t: TileType) {
  grid[r][c] = t;
}

// ─── Cafeteria (spawn, castle theme, warm gold) ───────────────
function makeCafeteria(): TileType[][] {
  const g = makeRoom();

  // Internal divider wall (vertical at col 8, with 3-tile door in middle)
  for (let r = 1; r < 15; r++) {
    if (r >= 6 && r <= 8) continue; // door gap
    setTile(g, r, 8, 0);
  }

  // Portal on RIGHT wall → Code Lab (row 7-8)
  setTile(g, 7, 15, 2);
  setTile(g, 8, 15, 2);

  // Portal on LEFT wall → Debug Room (row 7-8)
  setTile(g, 7, 0, 2);
  setTile(g, 8, 0, 2);

  // Portal on BOTTOM wall → Server Vault (col 7-8)
  setTile(g, 15, 7, 2);
  setTile(g, 15, 8, 2);

  // Task spots
  setTile(g, 4, 4, 3);
  setTile(g, 11, 11, 3);

  return g;
}

// ─── Code Lab (castle theme, cool blue) ───────────────────────
function makeCodeLab(): TileType[][] {
  const g = makeRoom();

  // Internal divider wall (vertical at col 8, door in middle)
  for (let r = 1; r < 15; r++) {
    if (r >= 6 && r <= 8) continue;
    setTile(g, r, 8, 0);
  }

  // Portal on LEFT wall → back to Cafeteria (row 7-8)
  setTile(g, 7, 0, 2);
  setTile(g, 8, 0, 2);

  // Task spots
  setTile(g, 3, 4, 3);
  setTile(g, 12, 12, 3);

  return g;
}

// ─── Debug Room (castle theme, purple) ────────────────────────
function makeDebugRoom(): TileType[][] {
  const g = makeRoom();

  // Internal divider wall
  for (let r = 1; r < 15; r++) {
    if (r >= 6 && r <= 8) continue;
    setTile(g, r, 8, 0);
  }

  // Portal on RIGHT wall → back to Cafeteria (row 7-8)
  setTile(g, 7, 15, 2);
  setTile(g, 8, 15, 2);

  // Task spots
  setTile(g, 4, 3, 3);
  setTile(g, 11, 12, 3);

  return g;
}

// ─── Server Vault (sci-fi theme, cyan) ────────────────────────
function makeServerVault(): TileType[][] {
  const g = makeRoom();

  // Internal divider wall
  for (let r = 1; r < 15; r++) {
    if (r >= 6 && r <= 8) continue;
    setTile(g, r, 8, 0);
  }

  // Portal on TOP wall → back to Cafeteria (col 7-8)
  setTile(g, 0, 7, 2);
  setTile(g, 0, 8, 2);

  // Task spots
  setTile(g, 5, 4, 3);
  setTile(g, 10, 11, 3);

  return g;
}

// ─── All Maps ─────────────────────────────────────────────────
export const MAPS: Record<string, MapConfig> = {
  cafeteria: {
    id: "cafeteria",
    name: "Cafeteria",
    theme: "castle",
    trimColor: 0xffcc33,
    floorColor: 0x1a1510,
    grid: makeCafeteria(),
    spawnX: 4,
    spawnY: 4,
    portals: [
      { tileX: 15, tileY: 7, targetMap: "codelab", targetTileX: 1, targetTileY: 7, label: "→ Code Lab" },
      { tileX: 15, tileY: 8, targetMap: "codelab", targetTileX: 1, targetTileY: 8, label: "→ Code Lab" },
      { tileX: 0, tileY: 7, targetMap: "debugroom", targetTileX: 14, targetTileY: 7, label: "→ Debug Room" },
      { tileX: 0, tileY: 8, targetMap: "debugroom", targetTileX: 14, targetTileY: 8, label: "→ Debug Room" },
      { tileX: 7, tileY: 15, targetMap: "servervault", targetTileX: 7, targetTileY: 1, label: "↓ Server Vault" },
      { tileX: 8, tileY: 15, targetMap: "servervault", targetTileX: 8, targetTileY: 1, label: "↓ Server Vault" },
    ],
    tasks: [
      { id: "swipe", tileX: 4, tileY: 4, label: "Swipe Card", room: "cafeteria", icon: "*" },
      { id: "wires", tileX: 11, tileY: 11, label: "Fix Wires", room: "cafeteria", icon: "+" },
    ],
  },

  codelab: {
    id: "codelab",
    name: "Code Lab",
    theme: "castle",
    trimColor: 0x00aaff,
    floorColor: 0x0c1628,
    grid: makeCodeLab(),
    spawnX: 1,
    spawnY: 7,
    portals: [
      { tileX: 0, tileY: 7, targetMap: "cafeteria", targetTileX: 14, targetTileY: 7, label: "→ Cafeteria" },
      { tileX: 0, tileY: 8, targetMap: "cafeteria", targetTileX: 14, targetTileY: 8, label: "→ Cafeteria" },
    ],
    tasks: [
      { id: "compile", tileX: 4, tileY: 3, label: "Compile Code", room: "codelab", icon: ">" },
      { id: "debug_var", tileX: 12, tileY: 12, label: "Fix Variables", room: "codelab", icon: "#" },
    ],
  },

  debugroom: {
    id: "debugroom",
    name: "Debug Room",
    theme: "castle",
    trimColor: 0xcc66ff,
    floorColor: 0x140c1e,
    grid: makeDebugRoom(),
    spawnX: 14,
    spawnY: 7,
    portals: [
      { tileX: 15, tileY: 7, targetMap: "cafeteria", targetTileX: 1, targetTileY: 7, label: "→ Cafeteria" },
      { tileX: 15, tileY: 8, targetMap: "cafeteria", targetTileX: 1, targetTileY: 8, label: "→ Cafeteria" },
    ],
    tasks: [
      { id: "stacktrc", tileX: 3, tileY: 4, label: "Read Stack Trace", room: "debugroom", icon: "@" },
      { id: "memleak", tileX: 12, tileY: 11, label: "Fix Memory Leak", room: "debugroom", icon: "!" },
    ],
  },

  servervault: {
    id: "servervault",
    name: "Server Vault",
    theme: "scifi",
    trimColor: 0x00e5ff,
    floorColor: 0x0a1628,
    grid: makeServerVault(),
    spawnX: 7,
    spawnY: 1,
    portals: [
      { tileX: 7, tileY: 0, targetMap: "cafeteria", targetTileX: 7, targetTileY: 14, label: "↑ Cafeteria" },
      { tileX: 8, tileY: 0, targetMap: "cafeteria", targetTileX: 8, targetTileY: 14, label: "↑ Cafeteria" },
    ],
    tasks: [
      { id: "patch_fw", tileX: 4, tileY: 5, label: "Patch Firewall", room: "servervault", icon: "⛊" },
      { id: "flush_cache", tileX: 11, tileY: 10, label: "Flush Cache", room: "servervault", icon: "⟳" },
    ],
  },
};

export const START_MAP = "cafeteria";
