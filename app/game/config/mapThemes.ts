// ─── Map Theme Configurations ───────────────────────────────────────────────

export interface MapThemeConfig {
  bgColor: number;
  floorPrimary: number;
  floorSecondary: number;
  floorAccent: number;
  wallPrimary: number;
  wallSecondary: number;
  wallHighlight: number;
  wallShadow: number;
  accentColor: number;
  accentGlow: number;
  trimColor: number;
  propPrimary: number;
  propSecondary: number;
  propHighlight: number;
  ambientParticles: boolean;
  scanlines: boolean;
  hexPattern: boolean;
  glowIntensity: number;
  minimapColor: string;
  minimapBg: string;
}

export const CAFETERIA_THEME: MapThemeConfig = {
  bgColor: 0x1a1510,
  floorPrimary: 0x5c3a1e,
  floorSecondary: 0x6b4423,
  floorAccent: 0x7a5230,
  wallPrimary: 0x3a3632,
  wallSecondary: 0x504a42,
  wallHighlight: 0x5a5448,
  wallShadow: 0x242220,
  accentColor: 0xffcc33,
  accentGlow: 0xffdd66,
  trimColor: 0xffcc33,
  propPrimary: 0x5a3a1a,
  propSecondary: 0x8a6238,
  propHighlight: 0xaa8255,
  ambientParticles: false,
  scanlines: false,
  hexPattern: false,
  glowIntensity: 0.3,
  minimapColor: "#ffcc33",
  minimapBg: "rgba(255, 200, 50, 0.15)",
};

export const CODELAB_THEME: MapThemeConfig = {
  bgColor: 0x0c1628,
  floorPrimary: 0x0a1a2a,
  floorSecondary: 0x0c1c30,
  floorAccent: 0x112840,
  wallPrimary: 0x1a2a3a,
  wallSecondary: 0x223344,
  wallHighlight: 0x2a3a4a,
  wallShadow: 0x0a1520,
  accentColor: 0x00aaff,
  accentGlow: 0x00ccff,
  trimColor: 0x00aaff,
  propPrimary: 0x1a2a3a,
  propSecondary: 0x2a3a4a,
  propHighlight: 0x00aaff,
  ambientParticles: true,
  scanlines: true,
  hexPattern: false,
  glowIntensity: 0.5,
  minimapColor: "#00aaff",
  minimapBg: "rgba(0, 170, 255, 0.15)",
};

export const DEBUGROOM_THEME: MapThemeConfig = {
  bgColor: 0x140c1e,
  floorPrimary: 0x1a0f28,
  floorSecondary: 0x201430,
  floorAccent: 0x2a1a3a,
  wallPrimary: 0x2a1a3a,
  wallSecondary: 0x3a2a4a,
  wallHighlight: 0x4a3a5a,
  wallShadow: 0x100a18,
  accentColor: 0xcc66ff,
  accentGlow: 0xdd88ff,
  trimColor: 0xcc66ff,
  propPrimary: 0x2a1a3a,
  propSecondary: 0x3a2a4a,
  propHighlight: 0xcc66ff,
  ambientParticles: true,
  scanlines: false,
  hexPattern: true,
  glowIntensity: 0.6,
  minimapColor: "#cc66ff",
  minimapBg: "rgba(200, 100, 255, 0.15)",
};

export const SERVERVAULT_THEME: MapThemeConfig = {
  bgColor: 0x0a1628,
  floorPrimary: 0x0c1e30,
  floorSecondary: 0x0e2238,
  floorAccent: 0x102840,
  wallPrimary: 0x1a2a3a,
  wallSecondary: 0x223344,
  wallHighlight: 0x2a4050,
  wallShadow: 0x0a1a2a,
  accentColor: 0x00e5ff,
  accentGlow: 0x00ffff,
  trimColor: 0x00e5ff,
  propPrimary: 0x1a2a3a,
  propSecondary: 0x2a3a4a,
  propHighlight: 0x00e5ff,
  ambientParticles: true,
  scanlines: true,
  hexPattern: true,
  glowIntensity: 0.7,
  minimapColor: "#00e5ff",
  minimapBg: "rgba(0, 230, 255, 0.15)",
};

export const MAP_THEMES: Record<string, MapThemeConfig> = {
  cafeteria: CAFETERIA_THEME,
  codelab: CODELAB_THEME,
  debugroom: DEBUGROOM_THEME,
  servervault: SERVERVAULT_THEME,
};

export interface WorldPosition {
  offsetX: number;
  offsetY: number;
}

export const WORLD_POSITIONS: Record<string, WorldPosition> = {
  debugroom:   { offsetX: -16, offsetY: 0 },
  cafeteria:   { offsetX:   0, offsetY: 0 },
  codelab:     { offsetX:  16, offsetY: 0 },
  servervault: { offsetX:   0, offsetY: 16 },
};

export interface PropDef {
  type: "table" | "pillar" | "banner" | "terminal" | "cable" | "panel" | "rack" | "warning" | "glitch";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export const MAP_PROPS: Record<string, PropDef[]> = {
  cafeteria: [
    { type: "table",  x: 3,    y: 4,  w: 2,   h: 1.5 },
    { type: "table",  x: 3,    y: 10, w: 2,   h: 1.5 },
    { type: "table",  x: 10,   y: 4,  w: 2,   h: 1.5 },
    { type: "table",  x: 10,   y: 10, w: 2,   h: 1.5 },
    { type: "pillar", x: 2,    y: 2,  w: 1,   h: 1 },
    { type: "pillar", x: 13,   y: 2,  w: 1,   h: 1 },
    { type: "pillar", x: 2,    y: 13, w: 1,   h: 1 },
    { type: "pillar", x: 13,   y: 13, w: 1,   h: 1 },
    { type: "banner", x: 4,    y: 1,  w: 1,   h: 2 },
    { type: "banner", x: 11,   y: 1,  w: 1,   h: 2 },
  ],
  codelab: [
    { type: "terminal", x: 2,  y: 3,  w: 3,   h: 1.5 },
    { type: "terminal", x: 2,  y: 10, w: 3,   h: 1.5 },
    { type: "terminal", x: 10, y: 3,  w: 3,   h: 1.5 },
    { type: "terminal", x: 10, y: 10, w: 3,   h: 1.5 },
    { type: "cable",    x: 1,  y: 5,  w: 0.3, h: 5 },
    { type: "cable",    x: 14, y: 5,  w: 0.3, h: 5 },
    { type: "panel",    x: 6,  y: 1,  w: 2,   h: 1 },
    { type: "panel",    x: 10, y: 14, w: 2,   h: 1 },
  ],
  debugroom: [
    { type: "warning", x: 2,  y: 2,  w: 1, h: 1 },
    { type: "warning", x: 13, y: 2,  w: 1, h: 1 },
    { type: "warning", x: 2,  y: 13, w: 1, h: 1 },
    { type: "warning", x: 13, y: 13, w: 1, h: 1 },
    { type: "glitch",  x: 4,  y: 5,  w: 2, h: 3 },
    { type: "glitch",  x: 10, y: 8,  w: 2, h: 3 },
    { type: "panel",   x: 1,  y: 6,  w: 1, h: 4 },
    { type: "panel",   x: 14, y: 6,  w: 1, h: 4 },
  ],
  servervault: [
    { type: "rack",   x: 2,    y: 3,  w: 1.5, h: 4 },
    { type: "rack",   x: 2,    y: 9,  w: 1.5, h: 4 },
    { type: "rack",   x: 12.5, y: 3,  w: 1.5, h: 4 },
    { type: "rack",   x: 12.5, y: 9,  w: 1.5, h: 4 },
    { type: "cable",  x: 5,    y: 14, w: 6,   h: 0.5 },
    { type: "panel",  x: 5,    y: 1,  w: 6,   h: 1 },
  ],
};

export interface GhostConfig {
  alpha: number;
  tint: number;
  blur: boolean;
  saturation: number;
}

export const GHOST_LAYER_CONFIG: GhostConfig = {
  alpha: 0.25,
  tint: 0x333344,
  blur: false,
  saturation: 0.2,
};
