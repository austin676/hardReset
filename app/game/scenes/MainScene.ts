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
    codelab: 0x00aaff,   // cool blue
    cafeteria: 0xffcc33,   // warm gold
    debugroom: 0xcc66ff,   // purple
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
  private eKey!: Phaser.Input.Keyboard.Key;
  private isTeleporting = false;

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

    // E key for task interaction
    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    // Signal React that the scene is fully initialised — remote players can now be spawned
    gameEventBus.emit("scene:ready", {});
  }

  /* ═══════════ UPDATE ═══════════════════════════════════ */
  update(): void {
    if (!this.player?.active) return;
    this.player.handleMovement();
    this.player.updateOverlays();
    this.checkProximity();
    this.detectRoom();

    // E key = interact with nearest station
    if (Phaser.Input.Keyboard.JustDown(this.eKey) && this.nearestStation && !this.nearestStation.completed) {
      gameEventBus.emit(GameEvents.TASK_INTERACT, { stationId: this.nearestStation.stationId, fromButton: true });
    }
  }

  /* ── Map rendering ─────────────────────────────────── */
  private buildMap(): void {
    this.wallLayer = this.physics.add.staticGroup();

    const floor = this.add.graphics().setDepth(0);
    const walls = this.add.graphics().setDepth(2);
    const trim = this.add.graphics().setDepth(3);
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
        Math.floor(dim.red * 0.5), Math.floor(dim.green * 0.5), Math.floor(dim.blue * 0.5));
      const T = TILE;

      switch (room.id) {
        case "codelab": {
          // ── Monitor desks (2 rows of workstations) ──
          for (let row = 0; row < 2; row++) {
            for (let desk = 0; desk < 3; desk++) {
              const dx = ox + T * (2 + desk * 4);
              const dy = oy + T * (3 + row * 7);
              // Desk surface
              g.fillStyle(dimCol, 0.55).fillRect(dx, dy, T * 3, T * 1.5);
              g.lineStyle(1, col, 0.4).strokeRect(dx, dy, T * 3, T * 1.5);
              // Monitor screen (bright rectangle on desk)
              g.fillStyle(col, 0.15).fillRect(dx + T * 0.4, dy + T * 0.2, T * 2.2, T * 0.8);
              g.lineStyle(0.8, col, 0.6).strokeRect(dx + T * 0.4, dy + T * 0.2, T * 2.2, T * 0.8);
            }
          }
          // Server rack along right wall
          g.fillStyle(dimCol, 0.6).fillRect(ox + rw - T * 3, oy + T * 2, T * 1.5, T * 4);
          g.lineStyle(1, col, 0.5).strokeRect(ox + rw - T * 3, oy + T * 2, T * 1.5, T * 4);
          // LED dots
          for (let l = 0; l < 5; l++) {
            g.fillStyle(l % 2 === 0 ? 0x00ff88 : 0x00aaff, 0.8)
              .fillRect(ox + rw - T * 2.8, oy + T * 2.5 + l * T * 0.7, 3, 2);
          }
          break;
        }
        case "cafeteria": {
          // ── Round tables with chairs ──
          const tablePositions = [
            { cx: ox + T * 4, cy: oy + T * 5 },
            { cx: ox + T * 10, cy: oy + T * 5 },
            { cx: ox + T * 4, cy: oy + T * 11 },
            { cx: ox + T * 10, cy: oy + T * 11 },
          ];
          for (const tp of tablePositions) {
            // Table (circle)
            g.fillStyle(dimCol, 0.5).fillCircle(tp.cx, tp.cy, T * 1.2);
            g.lineStyle(1, col, 0.4).strokeCircle(tp.cx, tp.cy, T * 1.2);
            // 4 chair dots around table
            for (let c = 0; c < 4; c++) {
              const angle = (c * Math.PI) / 2 + Math.PI / 4;
              const sx = tp.cx + Math.cos(angle) * T * 1.8;
              const sy = tp.cy + Math.sin(angle) * T * 1.8;
              g.fillStyle(col, 0.2).fillCircle(sx, sy, T * 0.3);
            }
          }
          // Vending machine (right wall)
          g.fillStyle(dimCol, 0.6).fillRect(ox + rw - T * 3, oy + T * 7, T * 1.5, T * 2.5);
          g.lineStyle(1, col, 0.5).strokeRect(ox + rw - T * 3, oy + T * 7, T * 1.5, T * 2.5);
          g.fillStyle(col, 0.2).fillRect(ox + rw - T * 2.8, oy + T * 7.3, T * 1.1, T * 1);
          break;
        }
        case "debugroom": {
          // ── Central debug console (hexagonal) ──
          const cx = ox + rw / 2, cy = oy + rh / 2;
          g.lineStyle(2, col, 0.7);
          drawHexagon(g, cx, cy, T * 2);
          g.fillStyle(col, 0.08);
          drawHexagonFill(g, cx, cy, T * 2);
          // Inner ring
          g.lineStyle(1, col, 0.3);
          drawHexagon(g, cx, cy, T * 1);
          // Pulse indicator
          g.fillStyle(col, 0.3).fillCircle(cx, cy, T * 0.4);
          g.fillStyle(0xffffff, 0.5).fillCircle(cx, cy, T * 0.15);

          // Log display panels (left and right walls)
          for (let side = 0; side < 2; side++) {
            const px = ox + T * 2 + side * (rw - T * 5);
            g.fillStyle(dimCol, 0.5).fillRect(px, oy + T * 3, T * 2.5, T * 5);
            g.lineStyle(1, col, 0.5).strokeRect(px, oy + T * 3, T * 2.5, T * 5);
            // Fake log lines
            for (let line = 0; line < 6; line++) {
              const w = T * (0.8 + (line * 13 % 7) * 0.2);
              g.fillStyle(col, 0.15 + (line % 3) * 0.05)
                .fillRect(px + 3, oy + T * 3.5 + line * T * 0.7, w, 2);
            }
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
    // Helper: re-enable input after any modal/meeting closes
    const resumeInput = () => {
      this.player.enableMovement();
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    };

    // Helper: freeze input when a modal/meeting opens
    const freezeInput = () => {
      this.player.disableMovement();
      if (this.input.keyboard) this.input.keyboard.enabled = false;
    };

    // ── Keyboard E → open coding puzzle popup ──
    this.input.keyboard?.on("keydown-E", () => {
      if (this.nearestStation && !this.nearestStation.completed) {
        freezeInput();
        gameEventBus.emit(GameEvents.OPEN_PUZZLE, {
          stationId: this.nearestStation.stationId,
          label: this.nearestStation.label,
        });
      }
    });

    // ── Task interact: [E] USE button or station click → open puzzle popup ──
    gameEventBus.on(GameEvents.TASK_INTERACT, (data: { stationId?: string; label?: string; fromButton?: boolean }) => {
      freezeInput();

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

    // ── Task complete (from React modal submit) ──
    gameEventBus.on(GameEvents.TASK_COMPLETE, (data: { stationId: string }) => {
      const station = this.stations.find(s => s.stationId === data.stationId);
      if (station && !station.completed) {
        station.markComplete();
        this.nearestStation = null;
        gameEventBus.emit(GameEvents.HUD_NEAR_STATION, { near: false, label: "" });
      }
      this.cameras.main.shake(150, 0.005);
      resumeInput();
    });

    // ── Task modal closed without completing ──
    gameEventBus.on(GameEvents.TASK_MODAL_CLOSE, () => resumeInput());

    // ── Meeting: call → freeze + launch MeetingScene ──
    gameEventBus.on(GameEvents.CALL_MEETING, () => {
      freezeInput();
      this.scene.pause("MainScene");
      this.scene.launch("MeetingScene");
    });

    // ── Report body → same as meeting for demo ──
    gameEventBus.on(GameEvents.REPORT_BODY, () => {
      freezeInput();
      this.scene.pause("MainScene");
      this.scene.launch("MeetingScene");
    });

    // ── Meeting end ──
    gameEventBus.on(GameEvents.MEETING_END, () => resumeInput());

    // ── Remote players ──
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

    // ── Cleanup on scene shutdown (prevents listener duplication) ──
    this.events.on("shutdown", () => {
      this.input.keyboard?.removeAllListeners("keydown-E");
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
}
