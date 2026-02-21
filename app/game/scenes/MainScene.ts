import * as Phaser from "phaser";
import { gameEventBus } from "../GameEventBus";
import { GameEvents, TILE, type PlayerState } from "../types/game.types";
import {
  ROOMS, CORRIDORS, TASK_STATIONS,
  MAP_COLS, MAP_ROWS, generateFacilityMap,
} from "../config/facilityMap";
import { Player } from "../objects/Player";
import { TaskStation } from "../objects/TaskStation";
import { RemotePlayer } from "../objects/RemotePlayer";


// ─── Per-room trim colour (Among Us–style border tint) ──────
function roomTrimColor(id: string): number {
  const map: Record<string, number> = {
    reactor:    0xff4466,
    server:     0x00ccff,
    security:   0xff8800,
    medbay:     0x00ffaa,
    cafeteria:  0xffdd00,
    storage:    0xaa88ff,
    admin:      0x4488ff,
    weapons:    0xff3333,
    shields:    0x33ff88,
    navigation: 0x88ccff,
    comms:      0xff88ff,
  };
  return map[id] ?? 0x00ffff;
}

function drawHexagon(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  g.strokePoints(
    Array.from({ length: 6 }, (_, i) => new Phaser.Math.Vector2(pts[i * 2], pts[i * 2 + 1])),
    true,
  );
}

function drawHexagonFill(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return new Phaser.Math.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a));
  });
  g.fillPoints(pts, true);
}

// ─── MainScene ────────────────────────────────────────────
// Renders the cyberpunk facility, spawns the player and task
// stations, handles physics, proximity and room detection.

export class MainScene extends Phaser.Scene {
  player!: Player;

  private mapData: number[][] = [];
  private wallLayer!: Phaser.Physics.Arcade.StaticGroup;
  private stations: TaskStation[] = [];
  private remotePlayers = new Map<string, RemotePlayer>();
  private nearestStation: TaskStation | null = null;
  private lastRoom = "";
  private readonly INTERACT_RANGE = 40;

  constructor() { super({ key: "MainScene" }); }

  /* ═══════════ CREATE ═══════════════════════════════════ */
  create(): void {
    this.mapData = generateFacilityMap();
    this.cameras.main.setBackgroundColor("#0a0a0a");
    this.physics.world.setBounds(0, 0, MAP_COLS * TILE, MAP_ROWS * TILE);

    this.buildMap();
    this.addRoomLabels();
    this.spawnStations();
    this.spawnPlayer();
    this.configCamera();
    this.scene.launch("HUDScene");
    this.wireEvents();
  }

  /* ═══════════ UPDATE ═══════════════════════════════════ */
  update(): void {
    this.player.handleMovement();
    this.player.updateOverlays();
    this.checkProximity();
    this.detectRoom();
  }

  /* ── Map rendering ─────────────────────────────────── */
  private buildMap(): void {
    this.wallLayer = this.physics.add.staticGroup();

    const floor   = this.add.graphics().setDepth(0);
    const walls   = this.add.graphics().setDepth(2);
    const trim    = this.add.graphics().setDepth(3);
    const details = this.add.graphics().setDepth(4);

    // ── 1. Corridor floors ──────────────────────────────
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (this.mapData[r][c] !== 4) continue;
        const x = c * TILE, y = r * TILE;
        floor.fillStyle(0x0d1117, 1).fillRect(x, y, TILE, TILE);
        floor.lineStyle(0.4, 0x1a2332, 0.6).strokeRect(x, y, TILE, TILE);
      }
    }

    // ── 2. Room floors ──────────────────────────────────
    for (const room of ROOMS) {
      const rx = room.x * TILE, ry = room.y * TILE;
      const rw = room.w * TILE, rh = room.h * TILE;

      // Main floor fill
      floor.fillStyle(room.floorColor, 1).fillRect(rx, ry, rw, rh);

      // Subtle floor grid
      floor.lineStyle(0.3, 0xffffff, 0.04);
      for (let dc = 0; dc < room.w; dc++)
        floor.lineBetween(rx + dc * TILE, ry, rx + dc * TILE, ry + rh);
      for (let dr = 0; dr < room.h; dr++)
        floor.lineBetween(rx, ry + dr * TILE, rx + rw, ry + dr * TILE);
    }

    // ── 3. Wall tiles (with edge highlight / shadow) ────
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (this.mapData[r][c] !== 3) continue;
        const x = c * TILE, y = r * TILE;

        // Wall fill — slate
        walls.fillStyle(0x1c2433, 1).fillRect(x, y, TILE, TILE);
        // Top highlight
        walls.fillStyle(0x2e3f55, 1).fillRect(x, y, TILE, 2);
        // Bottom shadow
        walls.fillStyle(0x0a0f19, 1).fillRect(x, y + TILE - 1, TILE, 1);
        // Subtle vertical seam
        walls.lineStyle(0.3, 0x38506a, 0.4).strokeRect(x, y, TILE, TILE);

        // Collision
        const wb = this.add.rectangle(x + TILE / 2, y + TILE / 2, TILE, TILE).setOrigin(0.5);
        this.physics.add.existing(wb, true);
        this.wallLayer.add(wb);
      }
    }

    // ── 4. Colored trim border inside each room ─────────
    // (the pink/red inner lining from the Among Us aesthetic)
    for (const room of ROOMS) {
      const col = roomTrimColor(room.id);
      const rx = room.x * TILE, ry = room.y * TILE;
      const rw = room.w * TILE, rh = room.h * TILE;
      const T = TILE; // 1-tile thick inner border

      // Outer glow
      trim.lineStyle(3, col, 0.25).strokeRect(rx - 1, ry - 1, rw + 2, rh + 2);
      // Inner bright border
      trim.lineStyle(2, col, 0.7).strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
      // Inner floor strip (1 tile wide band along walls)
      const tc = Phaser.Display.Color.IntegerToColor(col);
      const stripColor = Phaser.Display.Color.GetColor(
        Math.min(255, Math.floor(tc.red * 0.25)),
        Math.min(255, Math.floor(tc.green * 0.25)),
        Math.min(255, Math.floor(tc.blue * 0.25)),
      );
      trim.fillStyle(stripColor, 0.55);
      // Top & bottom strips
      trim.fillRect(rx + T, ry + T, rw - T * 2, T);
      trim.fillRect(rx + T, ry + rh - T * 2, rw - T * 2, T);
      // Left & right strips
      trim.fillRect(rx + T, ry + T * 2, T, rh - T * 4);
      trim.fillRect(rx + rw - T * 2, ry + T * 2, T, rh - T * 4);
    }

    // ── 5. Corridor center-line accent ──────────────────
    for (const cor of CORRIDORS) {
      const isHoriz = cor.w > cor.h;
      details.lineStyle(1, 0x00fff0, 0.12);
      if (isHoriz) {
        const midY = (cor.y + cor.h / 2) * TILE;
        details.lineBetween(cor.x * TILE, midY, (cor.x + cor.w) * TILE, midY);
      } else {
        const midX = (cor.x + cor.w / 2) * TILE;
        details.lineBetween(midX, cor.y * TILE, midX, (cor.y + cor.h) * TILE);
      }
    }

    // ── 6. Room furniture ───────────────────────────────
    this.drawRoomFurniture(details);
  }

  /* ── Room furniture per room type ──────────────────── */
  private drawRoomFurniture(g: Phaser.GameObjects.Graphics): void {
    for (const room of ROOMS) {
      const ox = room.x * TILE;
      const oy = room.y * TILE;
      const rw = room.w * TILE;
      const rh = room.h * TILE;
      const col = roomTrimColor(room.id);
      const dim = Phaser.Display.Color.IntegerToColor(col);
      const dimCol = Phaser.Display.Color.GetColor(
        Math.floor(dim.red * 0.6), Math.floor(dim.green * 0.6), Math.floor(dim.blue * 0.6));
      const T = TILE;

      switch (room.id) {
        case "reactor": {
          // Central glowing reactor core (circle)
          const cx = ox + rw / 2, cy = oy + rh / 2;
          g.lineStyle(2, col, 0.8).strokeCircle(cx, cy, T * 1.5);
          g.lineStyle(1, col, 0.3).strokeCircle(cx, cy, T * 2.5);
          g.fillStyle(col, 0.15).fillCircle(cx, cy, T * 1.5);
          // Pipes radiating from core
          for (let a = 0; a < 4; a++) {
            const angle = (a * Math.PI) / 2;
            g.lineStyle(2, dimCol, 0.6)
              .lineBetween(cx + Math.cos(angle) * T * 1.6, cy + Math.sin(angle) * T * 1.6,
                           cx + Math.cos(angle) * T * 2.8, cy + Math.sin(angle) * T * 2.8);
          }
          break;
        }
        case "server": {
          // Server racks — vertical rectangles along left & right walls
          const rackW = T * 2, rackH = T * 4;
          for (let i = 0; i < 2; i++) {
            const rx = ox + T * 2 + i * (rw - T * 6);
            g.fillStyle(dimCol, 0.6).fillRect(rx, oy + T * 2, rackW, rackH);
            g.lineStyle(1, col, 0.5).strokeRect(rx, oy + T * 2, rackW, rackH);
            // LED rows
            for (let l = 0; l < 5; l++) {
              g.fillStyle(l % 2 === 0 ? 0x00ff88 : 0xff4400, 0.8)
               .fillRect(rx + 2, oy + T * 2 + l * (T * 0.7) + 2, 3, 2);
            }
          }
          break;
        }
        case "security": {
          // Monitor bank along the bottom wall
          const mw = rw - T * 4, mh = T * 2;
          const mx = ox + T * 2, my = oy + rh - T * 3;
          g.fillStyle(dimCol, 0.55).fillRect(mx, my, mw, mh);
          g.lineStyle(1, col, 0.5).strokeRect(mx, my, mw, mh);
          // Three screen dividers
          for (let s = 1; s < 4; s++)
            g.lineStyle(0.5, col, 0.3).lineBetween(mx + (mw / 4) * s, my, mx + (mw / 4) * s, my + mh);
          break;
        }
        case "medbay": {
          // Two scan beds
          const bw = T * 3, bh = T * 1.5;
          g.fillStyle(dimCol, 0.5).fillRect(ox + T * 2, oy + T * 2, bw, bh);
          g.lineStyle(1, col, 0.5).strokeRect(ox + T * 2, oy + T * 2, bw, bh);
          break;
        }
        case "cafeteria": {
          // Tables
          const tw = T * 3, th = T * 1.5;
          for (let i = 0; i < 2; i++) {
            const tx = ox + T * 2 + i * (T * 5);
            g.fillStyle(dimCol, 0.45).fillRect(tx, oy + rh / 2 - th / 2, tw, th);
            g.lineStyle(1, col, 0.4).strokeRect(tx, oy + rh / 2 - th / 2, tw, th);
          }
          break;
        }
        case "storage": {
          // Crates (stacked rectangles)
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 2; j++) {
              const cx = ox + T * (2 + i * 3);
              const cy = oy + T * (2 + j * 2.5);
              g.fillStyle(dimCol, 0.5).fillRect(cx, cy, T * 2, T * 2);
              g.lineStyle(1, col, 0.4).strokeRect(cx, cy, T * 2, T * 2);
              g.lineStyle(0.5, col, 0.2).lineBetween(cx, cy + T, cx + T * 2, cy + T);
            }
          }
          break;
        }
        case "admin": {
          // Central desk
          const dw = rw - T * 4, dh = T * 2;
          g.fillStyle(dimCol, 0.5).fillRect(ox + T * 2, oy + T * 2, dw, dh);
          g.lineStyle(1, col, 0.5).strokeRect(ox + T * 2, oy + T * 2, dw, dh);
          // Monitor on desk
          g.fillStyle(col, 0.2).fillRect(ox + rw / 2 - T, oy + T * 2 - T, T * 2, T);
          g.lineStyle(1, col, 0.6).strokeRect(ox + rw / 2 - T, oy + T * 2 - T, T * 2, T);
          break;
        }
        case "weapons": {
          // Weapon rack — horizontal bars
          for (let w = 0; w < 3; w++) {
            const wy = oy + T * (2 + w * 2);
            g.fillStyle(dimCol, 0.5).fillRect(ox + T * 2, wy, rw - T * 4, T);
            g.lineStyle(1, col, 0.4).strokeRect(ox + T * 2, wy, rw - T * 4, T);
          }
          break;
        }
        case "shields": {
          // Hexagon shield display
          const cx = ox + rw / 2, cy = oy + rh / 2;
          g.lineStyle(2, col, 0.7);
          drawHexagon(g, cx, cy, T * 2);
          g.fillStyle(col, 0.08);
          drawHexagonFill(g, cx, cy, T * 2);
          break;
        }
        case "navigation": {
          // Star chart ring
          const cx = ox + rw / 2, cy = oy + rh / 2;
          g.lineStyle(2, col, 0.6).strokeCircle(cx, cy, T * 2);
          g.lineStyle(0.5, col, 0.2).strokeCircle(cx, cy, T * 1);
          g.lineStyle(1, col, 0.3)
            .lineBetween(cx - T * 2.3, cy, cx + T * 2.3, cy)
            .lineBetween(cx, cy - T * 2.3, cx, cy + T * 2.3);
          break;
        }
        case "comms": {
          // Antenna + wave arcs
          const ax = ox + rw / 2, ay = oy + T * 2;
          g.lineStyle(2, col, 0.6).lineBetween(ax, ay, ax, ay + T * 2);
          for (let w = 1; w <= 2; w++) {
            g.lineStyle(1, col, 0.4 - w * 0.1);
            g.beginPath();
            g.arc(ax, ay + T, T * w, Math.PI + 0.9, -0.9, true);
            g.strokePath();
          }
          break;
        }
      }
    }
  }

  /* ── Room labels ───────────────────────────────────── */
  private addRoomLabels(): void {
    for (const room of ROOMS) {
      const cx = (room.x + room.w / 2) * TILE;
      // Place label near top of room, just below the trim strip
      const ty = (room.y + 2.2) * TILE;
      const col = roomTrimColor(room.id);
      const hex = `#${col.toString(16).padStart(6, "0")}`;
      this.add.text(cx, ty, room.name.toUpperCase(), {
        fontSize: "5px",
        fontFamily: '"Courier New", monospace',
        color: hex,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(5).setAlpha(0.85);
    }
  }

  /* ── Task stations ─────────────────────────────────── */
  private spawnStations(): void {
    for (const cfg of TASK_STATIONS) {
      const ts = new TaskStation(
        this,
        cfg.tileX * TILE + TILE / 2,
        cfg.tileY * TILE + TILE / 2,
        cfg.id, cfg.label, cfg.room, cfg.icon,
      );
      this.stations.push(ts);
    }
  }

  /* ── Player ────────────────────────────────────────── */
  private spawnPlayer(): void {
    const cafe = ROOMS.find(r => r.id === "cafeteria")!;
    const px = (cafe.x + cafe.w / 2) * TILE;
    const py = (cafe.y + cafe.h / 2) * TILE;
    this.player = new Player(this, px, py, "You", 0x3b82f6);
    this.physics.add.collider(this.player, this.wallLayer);
  }

  /* ── Camera ────────────────────────────────────────── */
  private configCamera(): void {
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setZoom(2.5);
    this.cameras.main.setDeadzone(40, 30);
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

  /* ── Room detection (for HUD) ──────────────────────── */
  private detectRoom(): void {
    const tx = Math.floor(this.player.x / TILE);
    const ty = Math.floor(this.player.y / TILE);
    let name = "Corridor";
    for (const room of ROOMS) {
      if (tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h) {
        name = room.name;
        break;
      }
    }
    if (name !== this.lastRoom) {
      this.lastRoom = name;
      gameEventBus.emit(GameEvents.HUD_ROOM_CHANGE, { room: name });
    }
  }

  /* ── Event wiring ──────────────────────────────────── */
  private wireEvents(): void {
    gameEventBus.on(GameEvents.TASK_INTERACT, (data: { stationId?: string; fromButton?: boolean }) => {
      if (data.fromButton && this.nearestStation) {
        this.nearestStation.markComplete();
        gameEventBus.emit(GameEvents.TASK_COMPLETE, { stationId: this.nearestStation.stationId });
        this.nearestStation = null;
        gameEventBus.emit(GameEvents.HUD_NEAR_STATION, { near: false, label: "" });
      }
    });

    gameEventBus.on(GameEvents.REMOTE_PLAYER_MOVE, (data: PlayerState) => {
      let rp = this.remotePlayers.get(data.id);
      if (!rp) {
        rp = new RemotePlayer(this, data.x, data.y, data.id, data.name, data.role, data.color);
        this.remotePlayers.set(data.id, rp);
      }
      rp.moveToPosition(data.x, data.y, data.direction);
    });

    gameEventBus.on(GameEvents.PLAYER_LEAVE, (data: { id: string }) => {
      const rp = this.remotePlayers.get(data.id);
      if (rp) { rp.destroy(); this.remotePlayers.delete(data.id); }
    });

    gameEventBus.on(GameEvents.MEETING_END, () => this.player.enableMovement());
  }
}
