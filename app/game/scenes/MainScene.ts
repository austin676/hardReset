import * as Phaser from "phaser";
import { gameEventBus } from "../GameEventBus";
import { GameEvents, TILE, MAP_SIZE, type PlayerState, type MapConfig } from "../types/game.types";
// OPEN_PUZZLE is used to open the coding puzzle modal from React
import { MAPS, START_MAP } from "../config/facilityMap";
import { MAP_THEMES, WORLD_POSITIONS, MAP_PROPS, GHOST_LAYER_CONFIG, type MapThemeConfig, type PropDef } from "../config/mapThemes";
import { Player } from "../objects/Player";
import { TaskStation } from "../objects/TaskStation";
import { RemotePlayer } from "../objects/RemotePlayer";
import { useGameStore } from "~/store/gameStore";

// ─── Drawing helpers ──────────────────────────────────────────
function drawHexagon(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return new Phaser.Math.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a));
  });
  g.strokePoints(pts, true);
}

function drawHexagonFill(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return new Phaser.Math.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a));
  });
  g.fillPoints(pts, true);
}

// ─── Color utility ────────────────────────────────────────────
function desaturate(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const gray = Math.floor(r * 0.3 + g * 0.59 + b * 0.11);
  const nr = Math.floor(r * amount + gray * (1 - amount));
  const ng = Math.floor(g * amount + gray * (1 - amount));
  const nb = Math.floor(b * amount + gray * (1 - amount));
  return (nr << 16) | (ng << 8) | nb;
}

function darken(color: number, amount: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * amount);
  const g = Math.floor(((color >> 8) & 0xff) * amount);
  const b = Math.floor((color & 0xff) * amount);
  return (r << 16) | (g << 8) | b;
}

// ─── MainScene ────────────────────────────────────────────────
export class MainScene extends Phaser.Scene {
  player!: Player;

  currentMapId = START_MAP;
  private wallLayer!: Phaser.Physics.Arcade.StaticGroup;
  private stations: TaskStation[] = [];
  private remotePlayers = new Map<string, RemotePlayer>();
  private nearestStation: TaskStation | null = null;
  private lastRoom = "";
  private readonly INTERACT_RANGE = 40;
  private eKey!: Phaser.Input.Keyboard.Key;
  private isTeleporting = false;

  // Graphics layers — kept so we can destroy & rebuild
  private gfxLayers: Phaser.GameObjects.Graphics[] = [];
  private mapLabels: Phaser.GameObjects.Text[] = [];
  private portalSprites: Phaser.GameObjects.Rectangle[] = [];

  // Ghost map layers (world awareness)
  private ghostContainer!: Phaser.GameObjects.Container;
  private ghostGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private ghostLabels: Map<string, Phaser.GameObjects.Text> = new Map();

  // Task blip markers
  private taskBlips: Phaser.GameObjects.Graphics[] = [];
  private taskBlipTweens: Phaser.Tweens.Tween[] = [];

  // Ambient particles
  private ambientEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  // Completed task IDs persist across map switches
  private completedTasks = new Set<string>();

  // Track which map each remote player is currently on
  private remotePlayerMaps = new Map<string, string>(); // socketId → mapId

  constructor() { super({ key: "MainScene" }); }

  /* ═══════════ CREATE ═══════════════════════════════════ */
  create(): void {
    this.cameras.main.setBackgroundColor("#0a0a0a");
    const worldPx = MAP_SIZE * TILE;
    this.physics.world.setBounds(0, 0, worldPx, worldPx);

    // Create ghost container for world awareness (renders behind main map)
    this.ghostContainer = this.add.container(0, 0).setDepth(-10);
    this.renderGhostMaps();

    this.loadMap(this.currentMapId, true);
    this.scene.launch("HUDScene");
    this.wireEvents();

    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    // Signal React that the scene is fully initialised — remote players can now be spawned
    gameEventBus.emit("scene:ready", {});
  }

  /* ═══════════ UPDATE ═══════════════════════════════════ */
  update(): void {
    if (!this.player?.active || this.isTeleporting) return;
    this.player.handleMovement();
    this.player.updateOverlays();
    this.checkProximity();
    this.checkPortals();
    this.emitRoomName();

    if (Phaser.Input.Keyboard.JustDown(this.eKey) && this.nearestStation && !this.nearestStation.completed) {
      gameEventBus.emit(GameEvents.TASK_INTERACT, { stationId: this.nearestStation.stationId, fromButton: true });
    }
  }

  /* ═══════════ MAP LOADING ════════════════════════════ */
  private loadMap(mapId: string, firstLoad = false, spawnTileX?: number, spawnTileY?: number): void {
    const cfg = MAPS[mapId];
    if (!cfg) return;
    this.currentMapId = mapId;
    const theme = MAP_THEMES[mapId] || MAP_THEMES.cafeteria;

    // Tear down previous map objects
    this.clearMap();

    // Update ghost maps visibility
    this.updateGhostMaps(mapId);

    // Build new map
    this.wallLayer = this.physics.add.staticGroup();
    this.buildMap(cfg);
    this.addMapLabel(cfg);
    this.spawnPortalMarkers(cfg);
    this.spawnStations(cfg);
    this.spawnTaskBlips(cfg);

    // Add ambient particles if theme supports it
    if (theme.ambientParticles) {
      this.createAmbientParticles(theme);
    }

    // Spawn or reposition player
    const px = ((spawnTileX ?? cfg.spawnX) + 0.5) * TILE;
    const py = ((spawnTileY ?? cfg.spawnY) + 0.5) * TILE;
    if (firstLoad) {
      // Use the player's actual name + color from the store
      const store = useGameStore.getState();
      const me = store.players.find(p => p.id === store.myPlayerId);
      const myName = me?.name ?? "You";
      const myColor = me?.color
        ? (typeof me.color === "string"
            ? parseInt((me.color as string).replace("#", ""), 16)
            : (me.color as unknown as number))
        : 0x3b82f6;
      this.player = new Player(this, px, py, myName, myColor);
      this.configCamera();
    } else {
      this.player.setPosition(px, py);
      this.player.setVelocity(0, 0);
    }
    this.physics.add.collider(this.player, this.wallLayer);

    // Emit room change & map change
    gameEventBus.emit(GameEvents.HUD_ROOM_CHANGE, { room: cfg.name });
    gameEventBus.emit(GameEvents.MAP_CHANGE, { mapId, tasks: cfg.tasks });
    this.lastRoom = cfg.name;

    // Show/hide remote players based on whether they share this map
    for (const [id, rp] of this.remotePlayers) {
      const theirMap = this.remotePlayerMaps.get(id) ?? "cafeteria";
      rp.setVisible(theirMap === mapId);
    }
  }

  private clearMap(): void {
    // Destroy graphics layers
    for (const g of this.gfxLayers) g.destroy();
    this.gfxLayers = [];

    // Destroy labels
    for (const l of this.mapLabels) l.destroy();
    this.mapLabels = [];

    // Destroy portal markers
    for (const p of this.portalSprites) p.destroy();
    this.portalSprites = [];

    // Destroy task blips
    for (const t of this.taskBlipTweens) t.destroy();
    this.taskBlipTweens = [];
    for (const b of this.taskBlips) b.destroy();
    this.taskBlips = [];

    // Destroy ambient particles
    if (this.ambientEmitter) {
      this.ambientEmitter.stop();
      this.ambientEmitter = undefined;
    }

    // Destroy stations
    for (const s of this.stations) s.destroy();
    this.stations = [];
    this.nearestStation = null;

    // Destroy wall bodies
    if (this.wallLayer) {
      this.wallLayer.clear(true, true);
    }

    // Remove colliders (Phaser re-creates them in loadMap)
    if (this.player) {
      this.physics.world.colliders.destroy();
    }
  }

  /* ═══════════ MAP RENDERING ══════════════════════════ */
  private buildMap(cfg: MapConfig): void {
    const floor = this.add.graphics().setDepth(0);
    const walls = this.add.graphics().setDepth(2);
    const trim = this.add.graphics().setDepth(3);
    const details = this.add.graphics().setDepth(4);
    const dividers = this.add.graphics().setDepth(2);
    this.gfxLayers.push(floor, walls, trim, details, dividers);

    const theme = cfg.theme;
    const col = cfg.trimColor;

    // ── Palettes ──
    const STONE_BASE = 0x3a3632;
    const STONE_LIGHT = 0x504a42;
    const STONE_DARK = 0x242220;
    const MORTAR = 0x2a2826;
    const WOOD_A = 0x5c3a1e;
    const WOOD_B = 0x6b4423;
    const WOOD_C = 0x7a5230;
    const WOOD_GRAIN = 0x4a2e14;

    const METAL_A = 0x1a2a3a;
    const METAL_B = 0x223344;
    const NEON_CYAN = 0x00e5ff;
    const NEON_DIM = 0x005566;
    const PANEL_SEAM = 0x0a1a2a;
    const HEX_GLOW = 0x00ccdd;

    const grid = cfg.grid;

    // ── 1. Floor tiles ──
    for (let r = 0; r < MAP_SIZE; r++) {
      for (let c = 0; c < MAP_SIZE; c++) {
        const t = grid[r][c];
        if (t === 0) continue; // wall — drawn in step 2
        const x = c * TILE, y = r * TILE;

        if (t === 2) {
          // Portal tile — glowing highlight
          const portalCol = theme === "scifi" ? NEON_CYAN : col;
          floor.fillStyle(portalCol, 0.15).fillRect(x, y, TILE, TILE);
          floor.lineStyle(1, portalCol, 0.5).strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
          continue;
        }

        if (theme === "scifi") {
          const tileCol = (r + c) % 2 === 0 ? 0x0c1e30 : 0x0e2238;
          floor.fillStyle(tileCol, 1).fillRect(x, y, TILE, TILE);
          floor.lineStyle(0.3, HEX_GLOW, 0.08);
          drawHexagon(floor, x + TILE / 2, y + TILE / 2, TILE * 0.42);
          if ((r + c) % 4 === 0) {
            floor.fillStyle(NEON_CYAN, 0.1).fillCircle(x + TILE / 2, y + TILE / 2, 1.5);
          }
        } else {
          // Castle
          const plankColor = r % 3 === 0 ? WOOD_A : r % 3 === 1 ? WOOD_B : WOOD_C;
          floor.fillStyle(plankColor, 1).fillRect(x, y, TILE, TILE);
          floor.lineStyle(0.3, WOOD_GRAIN, 0.35);
          floor.lineBetween(x, y + 4, x + TILE, y + 4);
          floor.lineBetween(x, y + 10, x + TILE, y + 10);
          if (r % 4 === 2 && c % 5 === 0) {
            floor.fillStyle(WOOD_GRAIN, 0.4).fillCircle(x + 7, y + 7, 2);
          }
        }
      }
    }

    // Plank end-joints (castle only)
    if (theme !== "scifi") {
      floor.lineStyle(0.4, WOOD_GRAIN, 0.2);
      for (let c = 3; c < MAP_SIZE - 1; c += 4) {
        for (let r = 1; r < MAP_SIZE - 1; r += 2) {
          if (grid[r][c] !== 0) {
            floor.lineBetween(c * TILE, r * TILE, c * TILE, (r + 1) * TILE);
          }
        }
      }
    }

    // Scan-line effect (scifi only)
    if (theme === "scifi") {
      floor.lineStyle(0.2, NEON_CYAN, 0.04);
      for (let r = 1; r < MAP_SIZE - 1; r++) {
        floor.lineBetween(TILE, r * TILE + 8, (MAP_SIZE - 1) * TILE, r * TILE + 8);
      }
    }

    // ── 2. Wall tiles ──
    for (let r = 0; r < MAP_SIZE; r++) {
      for (let c = 0; c < MAP_SIZE; c++) {
        if (grid[r][c] !== 0) continue;
        const x = c * TILE, y = r * TILE;

        if (theme === "scifi") {
          const panelCol = (r + c) % 2 === 0 ? METAL_A : METAL_B;
          walls.fillStyle(panelCol, 1).fillRect(x, y, TILE, TILE);
          walls.lineStyle(0.6, PANEL_SEAM, 0.8).strokeRect(x, y, TILE, TILE);
          walls.fillStyle(NEON_CYAN, 0.25).fillRect(x, y, TILE, 1);
          walls.fillStyle(NEON_DIM, 0.4).fillRect(x, y + TILE - 1, TILE, 1);
          if ((r + c) % 3 === 0) {
            walls.fillStyle(NEON_CYAN, 0.6).fillRect(x + TILE / 2 - 1, y + TILE / 2 - 1, 2, 2);
          }
        } else {
          const brickCol = (r + c) % 2 === 0 ? STONE_BASE : STONE_LIGHT;
          walls.fillStyle(brickCol, 1).fillRect(x, y, TILE, TILE);
          walls.lineStyle(0.6, MORTAR, 0.7);
          walls.lineBetween(x, y + TILE / 2, x + TILE, y + TILE / 2);
          const vOff = (r % 2 === 0) ? TILE / 2 : 0;
          walls.lineBetween(x + vOff, y, x + vOff, y + TILE / 2);
          walls.lineBetween(x + (vOff + TILE / 2) % TILE, y + TILE / 2, x + (vOff + TILE / 2) % TILE, y + TILE);
          walls.fillStyle(STONE_LIGHT, 0.5).fillRect(x, y, TILE, 2);
          walls.fillStyle(STONE_DARK, 0.7).fillRect(x, y + TILE - 2, TILE, 2);
        }

        // Collision body
        const wb = this.add.rectangle(x + TILE / 2, y + TILE / 2, TILE, TILE).setOrigin(0.5);
        this.physics.add.existing(wb, true);
        this.wallLayer.add(wb);
      }
    }

    // ── 3. Room trim border ──
    const rx = 0, ry = 0;
    const rw = MAP_SIZE * TILE, rh = MAP_SIZE * TILE;

    if (theme === "scifi") {
      trim.lineStyle(4, col, 0.12).strokeRect(rx - 2, ry - 2, rw + 4, rh + 4);
      trim.lineStyle(1.5, col, 0.7).strokeRect(rx, ry, rw, rh);
      trim.lineStyle(0.5, col, 0.3).strokeRect(rx + 3, ry + 3, rw - 6, rh - 6);
      // Corner data nodes
      const corners = [[TILE, TILE], [rw - TILE, TILE], [TILE, rh - TILE], [rw - TILE, rh - TILE]];
      for (const [tx, ty] of corners) {
        trim.fillStyle(col, 0.1).fillCircle(tx, ty, 6);
        trim.fillStyle(col, 0.6);
        trim.fillTriangle(tx, ty - 3, tx + 3, ty, tx, ty + 3);
        trim.fillTriangle(tx, ty - 3, tx - 3, ty, tx, ty + 3);
        trim.fillStyle(0xffffff, 0.5).fillCircle(tx, ty, 1);
      }
    } else {
      trim.lineStyle(3, col, 0.2).strokeRect(rx - 1, ry - 1, rw + 2, rh + 2);
      trim.lineStyle(1.5, col, 0.5).strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
      const torchR = 3;
      const corners = [[TILE, TILE], [rw - TILE, TILE], [TILE, rh - TILE], [rw - TILE, rh - TILE]];
      for (const [tx, ty] of corners) {
        trim.fillStyle(col, 0.15).fillCircle(tx, ty, torchR * 3);
        trim.fillStyle(col, 0.6).fillCircle(tx, ty, torchR);
        trim.fillStyle(0xffffff, 0.3).fillCircle(tx, ty, 1);
      }
    }

    // ── 4. Room furniture ──
    this.drawRoomFurniture(details, cfg);
  }

  /* ── Room furniture per map ──────────────────────────── */
  private drawRoomFurniture(g: Phaser.GameObjects.Graphics, cfg: MapConfig): void {
    const col = cfg.trimColor;
    const dim = Phaser.Display.Color.IntegerToColor(col);
    const dimCol = Phaser.Display.Color.GetColor(
      Math.floor(dim.red * 0.5), Math.floor(dim.green * 0.5), Math.floor(dim.blue * 0.5));
    const T = TILE;
    const W = MAP_SIZE * TILE;

    switch (cfg.id) {
      case "codelab": {
        // Monitor desks
        for (let row = 0; row < 2; row++) {
          for (let desk = 0; desk < 2; desk++) {
            const dx = T * (2 + desk * 5);
            const dy = T * (3 + row * 7);
            g.fillStyle(dimCol, 0.55).fillRect(dx, dy, T * 3, T * 1.5);
            g.lineStyle(1, col, 0.4).strokeRect(dx, dy, T * 3, T * 1.5);
            g.fillStyle(col, 0.15).fillRect(dx + T * 0.4, dy + T * 0.2, T * 2.2, T * 0.8);
            g.lineStyle(0.8, col, 0.6).strokeRect(dx + T * 0.4, dy + T * 0.2, T * 2.2, T * 0.8);
          }
        }
        // Server rack right side
        g.fillStyle(dimCol, 0.6).fillRect(W - T * 3, T * 2, T * 1.5, T * 4);
        g.lineStyle(1, col, 0.5).strokeRect(W - T * 3, T * 2, T * 1.5, T * 4);
        for (let l = 0; l < 5; l++) {
          g.fillStyle(l % 2 === 0 ? 0x00ff88 : 0x00aaff, 0.8)
            .fillRect(W - T * 2.8, T * 2.5 + l * T * 0.7, 3, 2);
        }
        break;
      }
      case "cafeteria": {
        // Round table with laptop (top-left half)
        const tlx = T * 4, tly = T * 5;
        g.fillStyle(dimCol, 0.5).fillCircle(tlx, tly, T * 1.2);
        g.lineStyle(1, col, 0.4).strokeCircle(tlx, tly, T * 1.2);
        for (let c = 0; c < 4; c++) {
          const angle = (c * Math.PI) / 2 + Math.PI / 4;
          g.fillStyle(col, 0.2).fillCircle(tlx + Math.cos(angle) * T * 1.8, tly + Math.sin(angle) * T * 1.8, T * 0.3);
        }
        g.fillStyle(0x222222, 0.9).fillRect(tlx - T * 0.7, tly - T * 0.5, T * 1.4, T * 0.9);
        g.fillStyle(0x00aaff, 0.25).fillRect(tlx - T * 0.55, tly - T * 0.35, T * 1.1, T * 0.55);

        // Food counter (top-right half)
        const fcx = T * 9, fcy = T * 4;
        g.fillStyle(0x5a3a1a, 0.8).fillRect(fcx, fcy, T * 5, T * 1.8);
        g.lineStyle(1.2, 0x7a5230, 0.7).strokeRect(fcx, fcy, T * 5, T * 1.8);
        g.fillStyle(0x8a6238, 0.6).fillRect(fcx, fcy, T * 5, T * 0.4);
        for (let s = 0; s < 3; s++) {
          const sx = fcx + T * 0.4 + s * T * 1.6;
          g.fillStyle(0x888888, 0.3).fillRect(sx, fcy + T * 0.6, T * 1.2, T * 0.9);
          const foodColors = [0xff6633, 0x66cc33, 0xffcc00];
          g.fillStyle(foodColors[s], 0.5).fillCircle(sx + T * 0.6, fcy + T * 1.05, T * 0.25);
        }

        // Bottom-left table
        const blx = T * 4, bly = T * 11;
        g.fillStyle(dimCol, 0.5).fillCircle(blx, bly, T * 1.2);
        g.lineStyle(1, col, 0.4).strokeCircle(blx, bly, T * 1.2);

        // Bottom-right computer
        const brx = T * 9.5, bry = T * 10;
        g.fillStyle(0x3d2b1a, 0.8).fillRect(brx, bry, T * 4, T * 2.5);
        g.fillStyle(0x111111, 0.9).fillRect(brx + T * 0.8, bry + T * 0.2, T * 2.4, T * 1.4);
        g.fillStyle(0x0066cc, 0.3).fillRect(brx + T * 1, bry + T * 0.35, T * 2, T * 1);
        break;
      }
      case "debugroom": {
        const cx = W / 2, cy = W / 2;
        g.lineStyle(2, col, 0.7);
        drawHexagon(g, cx, cy, T * 2);
        g.fillStyle(col, 0.08);
        drawHexagonFill(g, cx, cy, T * 2);
        g.lineStyle(1, col, 0.3);
        drawHexagon(g, cx, cy, T * 1);
        g.fillStyle(col, 0.3).fillCircle(cx, cy, T * 0.4);
        g.fillStyle(0xffffff, 0.5).fillCircle(cx, cy, T * 0.15);

        // Log panels
        for (let side = 0; side < 2; side++) {
          const px = T * 2 + side * (W - T * 5);
          g.fillStyle(dimCol, 0.5).fillRect(px, T * 3, T * 2.5, T * 5);
          g.lineStyle(1, col, 0.5).strokeRect(px, T * 3, T * 2.5, T * 5);
          for (let line = 0; line < 6; line++) {
            const w = T * (0.8 + (line * 13 % 7) * 0.2);
            g.fillStyle(col, 0.15 + (line % 3) * 0.05)
              .fillRect(px + 3, T * 3.5 + line * T * 0.7, w, 2);
          }
        }
        break;
      }
      case "servervault": {
        // 4 server racks
        const rackPositions = [[T * 2, T * 3], [T * 2, T * 9], [W - T * 4, T * 3], [W - T * 4, T * 9]];
        for (const [sx, sy] of rackPositions) {
          g.fillStyle(0x1a2a3a, 0.8).fillRect(sx, sy, T * 1.5, T * 4);
          g.lineStyle(1, 0x00e5ff, 0.3).strokeRect(sx, sy, T * 1.5, T * 4);
          for (let l = 0; l < 6; l++) {
            const ledColor = l % 3 === 0 ? 0x00ff88 : l % 3 === 1 ? 0x00e5ff : 0xff4444;
            g.fillStyle(ledColor, 0.7).fillRect(sx + 2, sy + T * 0.4 + l * T * 0.6, 3, 2);
          }
        }

        // Holographic table center
        const hcx = W / 2, hcy = W / 2;
        g.fillStyle(0x112233, 0.7).fillCircle(hcx, hcy, T * 1.8);
        g.lineStyle(1, 0x00e5ff, 0.5).strokeCircle(hcx, hcy, T * 1.8);
        g.lineStyle(1.5, 0x00e5ff, 0.25);
        drawHexagon(g, hcx, hcy, T * 1.3);
        g.fillStyle(0x00e5ff, 0.15).fillCircle(hcx, hcy, T * 0.5);
        g.fillStyle(0xffffff, 0.4).fillCircle(hcx, hcy, 1.5);

        // Data pipe bottom
        g.fillStyle(0x223344, 0.6).fillRect(T * 5, W - T * 3, T * 6, T * 0.8);
        g.lineStyle(0.5, 0x00e5ff, 0.3).strokeRect(T * 5, W - T * 3, T * 6, T * 0.8);
        break;
      }
    }
  }

  /* ── Map label ───────────────────────────────────────── */
  private addMapLabel(cfg: MapConfig): void {
    const cx = (MAP_SIZE / 2) * TILE;
    const ty = 2.2 * TILE;
    const hex = `#${cfg.trimColor.toString(16).padStart(6, "0")}`;
    const label = this.add.text(cx, ty, cfg.name.toUpperCase(), {
      fontSize: "5px",
      fontFamily: '"Courier New", monospace',
      color: hex,
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(5).setAlpha(0.85);
    this.mapLabels.push(label);
  }

  /* ── Portal markers (subtle animated glow rectangles) ── */
  private spawnPortalMarkers(cfg: MapConfig): void {
    for (const p of cfg.portals) {
      const px = p.tileX * TILE + TILE / 2;
      const py = p.tileY * TILE + TILE / 2;
      const portalCol = cfg.theme === "scifi" ? 0x00e5ff : cfg.trimColor;
      const marker = this.add.rectangle(px, py, TILE - 2, TILE - 2)
        .setStrokeStyle(1.5, portalCol, 0.7)
        .setFillStyle(portalCol, 0.08)
        .setDepth(6);
      this.tweens.add({
        targets: marker, alpha: 0.3, duration: 800,
        yoyo: true, repeat: -1, ease: "Sine.easeInOut",
      });
      this.portalSprites.push(marker);
    }
  }

  /* ── Task stations ─────────────────────────────────── */
  private spawnStations(cfg: MapConfig): void {
    for (const t of cfg.tasks) {
      const ts = new TaskStation(
        this,
        t.tileX * TILE + TILE / 2,
        t.tileY * TILE + TILE / 2,
        t.id, t.label, t.room, t.icon,
      );
      // Restore completed state
      if (this.completedTasks.has(t.id)) {
        ts.markComplete();
      }
      this.stations.push(ts);
    }
  }

  /* ── Camera ────────────────────────────────────────── */
  private configCamera(): void {
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setZoom(3.5);
    this.cameras.main.setDeadzone(30, 24);
  }

  /* ── Proximity → task stations ─────────────────────── */
  private checkProximity(): void {
    let closest: TaskStation | null = null;
    let closestDist = Infinity;

    for (const st of this.stations) {
      if (st.completed) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, st.x, st.y);
      if (d < this.INTERACT_RANGE && d < closestDist) {
        closestDist = d;
        closest = st;
      }
    }

    if (closest !== this.nearestStation) {
      this.nearestStation?.deactivate();
      closest?.activate();
      this.nearestStation = closest;
      gameEventBus.emit(GameEvents.HUD_NEAR_STATION, { near: !!closest, label: closest?.label ?? "" });
    }
  }

  /* ── Portal detection + map switch ─────────────────── */
  private checkPortals(): void {
    const cfg = MAPS[this.currentMapId];
    if (!cfg) return;

    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor(this.player.y / TILE);

    for (const p of cfg.portals) {
      if (ptx === p.tileX && pty === p.tileY) {
        this.teleportTo(p.targetMap, p.targetTileX, p.targetTileY);
        return;
      }
    }
  }

  private teleportTo(mapId: string, tileX: number, tileY: number): void {
    if (this.isTeleporting) return;
    this.isTeleporting = true;
    this.player.disableMovement();

    const cam = this.cameras.main;
    const baseZoom = 2.5;

    // Smooth zoom out + fade out
    this.tweens.add({
      targets: cam,
      zoom: baseZoom * 0.85,
      duration: 150,
      ease: "Quad.easeIn",
    });

    cam.fadeOut(180, 0, 0, 0);
    cam.once("camerafadeoutcomplete", () => {
      this.loadMap(mapId, false, tileX, tileY);

      // Start zoomed in, then ease out to normal
      cam.setZoom(baseZoom * 1.15);
      this.tweens.add({
        targets: cam,
        zoom: baseZoom,
        duration: 280,
        ease: "Quad.easeOut",
      });

      cam.fadeIn(220, 0, 0, 0);
      cam.once("camerafadeincomplete", () => {
        this.isTeleporting = false;
        this.player.enableMovement();
      });
    });
  }

  /* ── Room name for HUD ─────────────────────────────── */
  private emitRoomName(): void {
    const cfg = MAPS[this.currentMapId];
    if (!cfg) return;
    const name = cfg.name;
    if (name !== this.lastRoom) {
      this.lastRoom = name;
      gameEventBus.emit(GameEvents.HUD_ROOM_CHANGE, { room: name });
    }
  }

  /* ── Event wiring ──────────────────────────────────── */
  private wireEvents(): void {
    const resumeInput = () => {
      this.player.enableMovement();
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    };

    const freezeInput = () => {
      this.player.disableMovement();
      if (this.input.keyboard) this.input.keyboard.enabled = false;
    };

    gameEventBus.on(GameEvents.TASK_INTERACT, (data: { stationId?: string; label?: string; fromButton?: boolean }) => {
      freezeInput();
      // Open the React coding puzzle popup instead of directly completing
      if (data.fromButton && this.nearestStation) {
        gameEventBus.emit(GameEvents.OPEN_PUZZLE, {
          stationId: this.nearestStation.stationId,
          label: this.nearestStation.label,
        });
      } else if (data.stationId) {
        gameEventBus.emit(GameEvents.OPEN_PUZZLE, {
          stationId: data.stationId,
          label: data.label ?? data.stationId,
        });
      }
    });

    gameEventBus.on(GameEvents.TASK_COMPLETE, (data: { stationId: string }) => {
      this.completedTasks.add(data.stationId);
      const station = this.stations.find(s => s.stationId === data.stationId);
      if (station && !station.completed) {
        station.markComplete();
        this.nearestStation = null;
        gameEventBus.emit(GameEvents.HUD_NEAR_STATION, { near: false, label: "" });
      }
      this.cameras.main.shake(150, 0.005);
      resumeInput();
    });

    gameEventBus.on(GameEvents.TASK_MODAL_CLOSE, () => resumeInput());

    gameEventBus.on(GameEvents.CALL_MEETING, () => {
      freezeInput();
      this.scene.pause("MainScene");
      this.scene.launch("MeetingScene");
    });

    gameEventBus.on(GameEvents.REPORT_BODY, () => {
      freezeInput();
      this.scene.pause("MainScene");
      this.scene.launch("MeetingScene");
    });

    gameEventBus.on(GameEvents.MEETING_END, () => resumeInput());

    gameEventBus.on(GameEvents.REMOTE_PLAYER_MOVE, (data: PlayerState & { mapId?: string }) => {
      const theirMap = (data as any).mapId ?? "cafeteria";
      this.remotePlayerMaps.set(data.id, theirMap);

      let rp = this.remotePlayers.get(data.id);
      if (!rp) {
        rp = new RemotePlayer(this, data.x, data.y, data.id, data.name, data.role, data.color);
        this.remotePlayers.set(data.id, rp);
      }
      // Only show & move the remote player if they are in the same map as us
      const visible = theirMap === this.currentMapId;
      rp.setVisible(visible);
      if (visible) rp.moveToPosition(data.x, data.y, data.direction);
    });

    gameEventBus.on(GameEvents.PLAYER_LEAVE, (data: { id: string }) => {
      const rp = this.remotePlayers.get(data.id);
      if (rp) { rp.destroy(); this.remotePlayers.delete(data.id); }
      this.remotePlayerMaps.delete(data.id);
    });

    this.events.on("shutdown", () => {
      gameEventBus.removeAllListeners(GameEvents.TASK_INTERACT);
      gameEventBus.removeAllListeners(GameEvents.TASK_COMPLETE);
      gameEventBus.removeAllListeners(GameEvents.TASK_MODAL_CLOSE);
      gameEventBus.removeAllListeners(GameEvents.CALL_MEETING);
      gameEventBus.removeAllListeners(GameEvents.REPORT_BODY);
      gameEventBus.removeAllListeners(GameEvents.MEETING_END);
      gameEventBus.removeAllListeners(GameEvents.REMOTE_PLAYER_MOVE);
      gameEventBus.removeAllListeners(GameEvents.PLAYER_LEAVE);
    });
  }

  /* ═══════════ GHOST MAPS (World Awareness) ═══════════════ */
  private renderGhostMaps(): void {
    const currentPos = WORLD_POSITIONS[this.currentMapId] || { offsetX: 0, offsetY: 0 };

    for (const [mapId, cfg] of Object.entries(MAPS)) {
      if (mapId === this.currentMapId) continue;

      const pos = WORLD_POSITIONS[mapId];
      if (!pos) continue;

      const theme = MAP_THEMES[mapId] || MAP_THEMES.cafeteria;
      const offsetX = (pos.offsetX - currentPos.offsetX) * TILE;
      const offsetY = (pos.offsetY - currentPos.offsetY) * TILE;

      const g = this.add.graphics().setDepth(-10);
      this.drawGhostMap(g, cfg, theme, offsetX, offsetY);
      this.ghostContainer.add(g);
      this.ghostGraphics.set(mapId, g);

      // Ghost map label
      const labelX = offsetX + (MAP_SIZE / 2) * TILE;
      const labelY = offsetY + 2.5 * TILE;
      const ghostCol = desaturate(theme.accentColor, GHOST_LAYER_CONFIG.saturation);
      const hex = `#${ghostCol.toString(16).padStart(6, "0")}`;
      const label = this.add.text(labelX, labelY, cfg.name.toUpperCase(), {
        fontSize: "5px",
        fontFamily: '"Courier New", monospace',
        color: hex,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(-9).setAlpha(GHOST_LAYER_CONFIG.alpha * 1.5);
      this.ghostContainer.add(label);
      this.ghostLabels.set(mapId, label);
    }
  }

  private drawGhostMap(g: Phaser.GameObjects.Graphics, cfg: MapConfig, theme: MapThemeConfig, ox: number, oy: number): void {
    const alpha = GHOST_LAYER_CONFIG.alpha;
    const sat = GHOST_LAYER_CONFIG.saturation;
    const grid = cfg.grid;

    // Desaturated floor
    const floorCol = desaturate(darken(theme.floorPrimary, 0.5), sat);
    const wallCol = desaturate(darken(theme.wallPrimary, 0.4), sat);
    const accentCol = desaturate(theme.accentColor, sat);

    for (let r = 0; r < MAP_SIZE; r++) {
      for (let c = 0; c < MAP_SIZE; c++) {
        const t = grid[r][c];
        const x = ox + c * TILE;
        const y = oy + r * TILE;

        if (t === 0) {
          // Wall
          g.fillStyle(wallCol, alpha * 0.8).fillRect(x, y, TILE, TILE);
        } else if (t === 2) {
          // Portal
          g.fillStyle(accentCol, alpha * 0.3).fillRect(x, y, TILE, TILE);
        } else {
          // Floor
          g.fillStyle(floorCol, alpha * 0.6).fillRect(x, y, TILE, TILE);
        }
      }
    }

    // Border outline
    g.lineStyle(1, accentCol, alpha * 0.5);
    g.strokeRect(ox, oy, MAP_SIZE * TILE, MAP_SIZE * TILE);

    // Direction indicator (arrow pointing to portal connection)
    const arrowCol = accentCol;
    g.fillStyle(arrowCol, alpha * 0.6);
    const cx = ox + (MAP_SIZE / 2) * TILE;
    const cy = oy + (MAP_SIZE / 2) * TILE;
    g.fillTriangle(cx, cy - 8, cx - 5, cy + 4, cx + 5, cy + 4);
  }

  private updateGhostMaps(activeMapId: string): void {
    const currentPos = WORLD_POSITIONS[activeMapId] || { offsetX: 0, offsetY: 0 };

    // Reposition ghost maps relative to new active map
    for (const [mapId, g] of this.ghostGraphics) {
      const pos = WORLD_POSITIONS[mapId];
      if (!pos) continue;

      const offsetX = (pos.offsetX - currentPos.offsetX) * TILE;
      const offsetY = (pos.offsetY - currentPos.offsetY) * TILE;

      // Clear and redraw at new position
      g.clear();
      const cfg = MAPS[mapId];
      const theme = MAP_THEMES[mapId] || MAP_THEMES.cafeteria;
      if (cfg) {
        this.drawGhostMap(g, cfg, theme, offsetX, offsetY);
      }

      // Update label position
      const label = this.ghostLabels.get(mapId);
      if (label) {
        label.setPosition(offsetX + (MAP_SIZE / 2) * TILE, offsetY + 2.5 * TILE);
      }
    }

    // Show/hide ghost maps (hide the one we're in)
    for (const [mapId, g] of this.ghostGraphics) {
      g.setVisible(mapId !== activeMapId);
      const label = this.ghostLabels.get(mapId);
      if (label) label.setVisible(mapId !== activeMapId);
    }
  }

  /* ═══════════ TASK BLIPS ═══════════════════════════════ */
  private spawnTaskBlips(cfg: MapConfig): void {
    const theme = MAP_THEMES[cfg.id] || MAP_THEMES.cafeteria;

    for (const task of cfg.tasks) {
      if (this.completedTasks.has(task.id)) continue;

      const x = task.tileX * TILE + TILE / 2;
      const y = task.tileY * TILE + TILE / 2;

      const blip = this.add.graphics().setDepth(4);

      // Outer pulse ring
      blip.lineStyle(1.5, theme.accentGlow, 0.4);
      blip.strokeCircle(x, y, 12);

      // Inner glow
      blip.fillStyle(theme.accentColor, 0.15);
      blip.fillCircle(x, y, 8);

      // Core dot
      blip.fillStyle(theme.accentGlow, 0.7);
      blip.fillCircle(x, y, 3);

      this.taskBlips.push(blip);

      // Pulse animation
      const tween = this.tweens.add({
        targets: blip,
        alpha: 0.3,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.taskBlipTweens.push(tween);
    }
  }

  /* ═══════════ AMBIENT PARTICLES ═══════════════════════ */
  private createAmbientParticles(theme: MapThemeConfig): void {
    // Create a simple particle texture
    const particleKey = `particle_${theme.accentColor.toString(16)}`;

    if (!this.textures.exists(particleKey)) {
      const canvas = this.textures.createCanvas(particleKey, 4, 4);
      if (canvas) {
        const ctx = canvas.getContext();
        const hex = theme.accentGlow;
        const r = (hex >> 16) & 0xff;
        const g = (hex >> 8) & 0xff;
        const b = hex & 0xff;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
        ctx.beginPath();
        ctx.arc(2, 2, 2, 0, Math.PI * 2);
        ctx.fill();
        canvas.refresh();
      }
    }

    // Create particle emitter for ambient floating dust
    const emitter = this.add.particles(0, 0, particleKey, {
      x: { min: TILE, max: (MAP_SIZE - 1) * TILE },
      y: { min: TILE, max: (MAP_SIZE - 1) * TILE },
      lifespan: 4000,
      speed: { min: 2, max: 8 },
      scale: { start: 0.8, end: 0.2 },
      alpha: { start: 0.4, end: 0 },
      frequency: 300,
      quantity: 1,
      blendMode: Phaser.BlendModes.ADD,
    });
    emitter.setDepth(3);
    this.ambientEmitter = emitter;
  }
}
