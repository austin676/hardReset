import * as Phaser from "phaser";
import type { Direction, PlayerRole } from "../types/game.types";
import { gameEventBus } from "../GameEventBus";
import { GameEvents } from "../types/game.types";

// ─── Player ───────────────────────────────────────────────
// Among Us–style bean with per-frame canvas textures,
// 4-dir walk/idle anims, dust particles, role indicator.

const SPEED = 120;
const FW = 16;
const FH = 20;
const ANIM_FPS = 8;

// ── Helpers (top-level — avoids esbuild private-static bug) ──

function texKey(color: number): string {
  return `player_${color.toString(16)}`;
}

/**
 * Generate 16 individual canvas textures (4 dirs × 4 walk frames)
 * and register walk/idle animations for the given colour.
 * Returns the base key prefix (e.g. "player_3b82f6").
 * Exported so RemotePlayer can reuse it.
 */
export function ensurePlayerTextures(scene: Phaser.Scene, color: number): string {
  const baseKey = texKey(color);
  if (scene.textures.exists(`${baseKey}_0`)) return baseKey;

  const rv = (color >> 16) & 0xff;
  const gv = (color >> 8) & 0xff;
  const bv = color & 0xff;
  const body = `rgb(${rv},${gv},${bv})`;
  const dark = `rgb(${Math.max(0, rv - 50)},${Math.max(0, gv - 50)},${Math.max(0, bv - 50)})`;
  const lite = `rgb(${Math.min(255, rv + 50)},${Math.min(255, gv + 50)},${Math.min(255, bv + 50)})`;

  // Create one small canvas per frame so Phaser gets real single-frame textures
  // (addSpriteSheet with a canvas element doesn't slice frames properly in 3.90)
  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 4; frame++) {
      const idx = dir * 4 + frame;
      const cvs = document.createElement("canvas");
      cvs.width = FW;
      cvs.height = FH;
      const ctx = cvs.getContext("2d")!;
      drawBean(ctx, 0, 0, dir, frame, body, dark, lite);
      scene.textures.addCanvas(`${baseKey}_${idx}`, cvs);
    }
  }

  // Register per-colour animations
  const a = scene.anims;
  const dirs: [string, number[]][] = [
    ["down",  [0, 1, 2, 3]],
    ["left",  [4, 5, 6, 7]],
    ["right", [8, 9, 10, 11]],
    ["up",    [12, 13, 14, 15]],
  ];
  for (const [d, frames] of dirs) {
    const wk = `${baseKey}_walk_${d}`;
    const ik = `${baseKey}_idle_${d}`;
    if (!a.exists(wk))
      a.create({ key: wk, frames: frames.map(i => ({ key: `${baseKey}_${i}` })), frameRate: ANIM_FPS, repeat: -1 });
    if (!a.exists(ik))
      a.create({ key: ik, frames: [{ key: `${baseKey}_${frames[0]}` }], frameRate: 1, repeat: 0 });
  }

  return baseKey;
}

// ── Bean drawing (Canvas 2D) ─────────────────────────────

function drawBean(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  dir: number, frame: number,
  body: string, dark: string, lite: string,
): void {
  ctx.clearRect(ox, oy, FW, FH);

  // Shadow (wider, softer)
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(ox + 8, oy + 18, 6, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs (walk cycle) — draw BEHIND body
  const legColor = dark;
  ctx.fillStyle = legColor;
  if (frame % 2 === 0) {
    // Left leg forward, right leg back
    ctx.beginPath();
    ctx.roundRect(ox + 4, oy + 14, 3, 5, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(ox + 9, oy + 15, 3, 4, 1);
    ctx.fill();
  } else {
    // Right leg forward, left leg back
    ctx.beginPath();
    ctx.roundRect(ox + 4, oy + 15, 3, 4, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(ox + 9, oy + 14, 3, 5, 1);
    ctx.fill();
  }

  // Body — rounder bean shape
  const grad = ctx.createLinearGradient(ox + 2, oy + 2, ox + 14, oy + 16);
  grad.addColorStop(0, lite);
  grad.addColorStop(0.4, body);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(ox + 4, oy + 4);
  ctx.quadraticCurveTo(ox + 1, oy + 2, ox + 8, oy + 1);
  ctx.quadraticCurveTo(ox + 15, oy + 2, ox + 12, oy + 4);
  ctx.lineTo(ox + 13, oy + 13);
  ctx.quadraticCurveTo(ox + 13, oy + 15, ox + 8, oy + 15);
  ctx.quadraticCurveTo(ox + 3, oy + 15, ox + 3, oy + 13);
  ctx.closePath();
  ctx.fill();

  // Body outline
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // Belly highlight (subtle shine)
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.ellipse(ox + 7, oy + 9, 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Visor (large, rounded)
  const visorGrad = ctx.createLinearGradient(ox + 4, oy + 4, ox + 12, oy + 9);
  visorGrad.addColorStop(0, "rgba(180,220,255,1)");
  visorGrad.addColorStop(1, "rgba(80,160,255,0.85)");
  ctx.fillStyle = visorGrad;
  if (dir === 0) {       // facing down
    ctx.beginPath();
    ctx.roundRect(ox + 4, oy + 4, 8, 4, 2);
    ctx.fill();
  } else if (dir === 1) { // facing left
    ctx.beginPath();
    ctx.roundRect(ox + 3, oy + 4, 6, 4, 2);
    ctx.fill();
  } else if (dir === 2) { // facing right
    ctx.beginPath();
    ctx.roundRect(ox + 7, oy + 4, 6, 4, 2);
    ctx.fill();
  } else {                 // facing up — small visor reflection
    ctx.beginPath();
    ctx.roundRect(ox + 5, oy + 3, 6, 3, 1);
    ctx.fill();
  }

  // Visor highlight (white glint)
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  if (dir !== 3) {
    const vx = dir === 1 ? ox + 4 : dir === 2 ? ox + 8 : ox + 5;
    ctx.fillRect(vx, oy + 4, 2, 1);
  }

  // Backpack
  ctx.fillStyle = dark;
  if (dir === 0) {
    ctx.beginPath();
    ctx.roundRect(ox + 12, oy + 5, 3, 8, 1);
    ctx.fill();
  } else if (dir === 1) {
    ctx.beginPath();
    ctx.roundRect(ox + 12, oy + 5, 3, 7, 1);
    ctx.fill();
  } else if (dir === 2) {
    ctx.beginPath();
    ctx.roundRect(ox + 1, oy + 5, 3, 7, 1);
    ctx.fill();
  } else {
    // Back view — backpack visible both sides
    ctx.beginPath();
    ctx.roundRect(ox + 1, oy + 5, 3, 8, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(ox + 12, oy + 5, 3, 8, 1);
    ctx.fill();
  }

  // Antenna nub on top
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(ox + 8, oy + 1, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lite;
  ctx.beginPath();
  ctx.arc(ox + 8, oy + 0.5, 0.8, 0, Math.PI * 2);
  ctx.fill();
}

// ── Player class ─────────────────────────────────────────

export class Player extends Phaser.Physics.Arcade.Sprite {
  direction: Direction = "down";
  role: PlayerRole = "agent";
  playerName: string;
  playerColor: number;
  alive = true;

  private baseKey: string;
  private nameLabel: Phaser.GameObjects.Text;
  private roleBadge: Phaser.GameObjects.Text;
  private movementEnabled = true;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private lastDust = 0;
  private lastMoveEmit = 0;  // throttle PLAYER_MOVE bus events

  constructor(scene: Phaser.Scene, x: number, y: number, name = "Agent", color = 0x3b82f6) {
    const baseKey = ensurePlayerTextures(scene, color);
    super(scene, x, y, `${baseKey}_0`);          // idle-down frame 0

    this.playerName = name;
    this.playerColor = color;
    this.baseKey = baseKey;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setBodySize(10, 12);
    this.setOffset(3, 6);
    this.setDepth(10);

    this.setupInput();

    // Name label — pill background like Among Us
    this.nameLabel = scene.add
      .text(x, y - 18, ` ${name} `, {
        fontSize: "8px",
        fontFamily: '"Courier New", monospace',
        color: "#ffffff",
        fontStyle: "bold",
        backgroundColor: "#00000099",
        padding: { x: 3, y: 2 },
      })
      .setOrigin(0.5).setDepth(15);

    // Role indicator — small colored text tag
    this.roleBadge = scene.add
      .text(x, y - 28, "[AGT]", {
        fontSize: "6px",
        fontFamily: '"Courier New", monospace',
        color: "#22d3ee",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5).setDepth(15);

    // Spawn pop-in
    this.setAlpha(0).setScale(0.5);
    scene.tweens.add({
      targets: this, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 350, ease: "Back.easeOut",
    });
  }

  // ── Input ────────────────────────────────────────────
  private setupInput(): void {
    const kb = this.scene.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  // ── Movement (call from scene.update) ────────────────
  handleMovement(): void {
    if (!this.movementEnabled || !this.alive) {
      this.setVelocity(0, 0);
      this.playIdle();
      return;
    }

    const left  = this.cursors.left.isDown  || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up    = this.cursors.up.isDown    || this.wasd.W.isDown;
    const down  = this.cursors.down.isDown  || this.wasd.S.isDown;

    let vx = 0, vy = 0;
    if (left)  vx -= SPEED;
    if (right) vx += SPEED;
    if (up)    vy -= SPEED;
    if (down)  vy += SPEED;

    // Normalise diagonal
    if (vx !== 0 && vy !== 0) {
      const len = Math.sqrt(vx * vx + vy * vy);
      vx = (vx / len) * SPEED;
      vy = (vy / len) * SPEED;
    }
    this.setVelocity(vx, vy);

    if (vx !== 0 || vy !== 0) {
      if (left)       this.direction = "left";
      else if (right) this.direction = "right";
      else if (up)    this.direction = "up";
      else            this.direction = "down";

      const wk = `${this.baseKey}_walk_${this.direction}`;
      if (this.anims.currentAnim?.key !== wk) this.anims.play(wk, true);

      // Throttled position broadcast for multiplayer (50 ms)
      const now = this.scene.time.now;
      if (now - this.lastMoveEmit > 50) {
        this.lastMoveEmit = now;
        gameEventBus.emit(GameEvents.PLAYER_MOVE, {
          x:         this.x,
          y:         this.y,
          direction: this.direction,
          isMoving:  true,
        });
      }

      // Dust particles
      if (now - this.lastDust > 220) {
        this.lastDust = now;
        const d = this.scene.add.circle(this.x, this.y + 8, 1, 0x94a3b8, 0.3).setDepth(2);
        this.scene.tweens.add({
          targets: d, alpha: 0, scaleX: 2, scaleY: 2, y: d.y + 4,
          duration: 300, onComplete: () => d.destroy(),
        });
      }
    } else {
      this.playIdle();
    }
  }

  private playIdle(): void {
    const ik = `${this.baseKey}_idle_${this.direction}`;
    if (this.anims.currentAnim?.key !== ik) this.anims.play(ik, true);
  }

  // ── Overlay sync (call from scene.update) ────────────
  updateOverlays(): void {
    this.nameLabel.setPosition(this.x, this.y - 18);
    this.roleBadge.setPosition(this.x, this.y - 28);
  }

  // ── Public helpers ───────────────────────────────────
  setRole(r: PlayerRole): void {
    this.role = r;
    this.roleBadge.setText(r === "hacker" ? "[HAX]" : "[AGT]");
    this.roleBadge.setColor(r === "hacker" ? "#f97316" : "#22d3ee");
  }

  disableMovement(): void {
    this.movementEnabled = false;
    this.setVelocity(0, 0);
    this.playIdle();
  }

  enableMovement(): void {
    this.movementEnabled = true;
  }

  kill(): void {
    this.alive = false;
    this.disableMovement();
    this.scene.tweens.add({ targets: this, alpha: 0.3, duration: 400 });
    this.scene.tweens.add({ targets: [this.nameLabel, this.roleBadge], alpha: 0.4, duration: 300 });
  }

  get isMoving(): boolean {
    return (this.body as Phaser.Physics.Arcade.Body).velocity.length() > 0;
  }

  destroy(fromScene?: boolean): void {
    this.nameLabel?.destroy();
    this.roleBadge?.destroy();
    super.destroy(fromScene);
  }
}
