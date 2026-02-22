import * as Phaser from "phaser";
import { gameEventBus } from "../GameEventBus";
import { GameEvents } from "../types/game.types";

//  TaskStation — Waypoint Stop
// Hexagonal "metro stop" marker with a pulsing beacon,
// station label, and glowing ring when the player is nearby.

const STOP_R = 10;  // outer hex radius (px)
const INNER_R = 6;  // inner icon circle radius

const TC = {
  inactive:  0x334155,
  active:    0x00fff0,
  done:      0x39ff14,
  beacon:    0xffaa00,
  ground:    0x1a1a2e,
} as const;

export class TaskStation extends Phaser.GameObjects.Container {
  readonly stationId: string;
  readonly label: string;
  readonly room: string;
  completed = false;

  private gfx: Phaser.GameObjects.Graphics;
  private iconText: Phaser.GameObjects.Text;
  private labelText: Phaser.GameObjects.Text;
  private beaconRing: Phaser.GameObjects.Graphics;
  private isActive = false;
  private pulse?: Phaser.Tweens.Tween;
  private beaconPulse?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    id: string, label: string, room: string, icon: string,
  ) {
    super(scene, x, y);
    this.stationId = id;
    this.label = label;
    this.room = room;

    // Beacon ring (pulsing outer glow)
    this.beaconRing = scene.add.graphics();
    this.add(this.beaconRing);
    this.drawBeaconRing(TC.beacon, 0.15);

    // Start idle beacon pulse
    this.beaconPulse = scene.tweens.add({
      targets: this.beaconRing,
      scaleX: 1.4, scaleY: 1.4, alpha: 0,
      duration: 1500, ease: "Sine.easeOut",
      yoyo: false, repeat: -1,
      onRepeat: () => {
        this.beaconRing.setScale(1).setAlpha(0.15);
      },
    });

    // Main hexagon body
    this.gfx = scene.add.graphics();
    this.add(this.gfx);
    this.drawStop(TC.inactive, 0.6);

    // Center icon
    this.iconText = scene.add
      .text(0, 0, icon, {
        fontSize: "7px",
        fontFamily: '"Courier New", monospace',
        color: "#ffaa00",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.add(this.iconText);

    // Station label (shown on proximity)
    this.labelText = scene.add
      .text(0, STOP_R + 9, label, {
        fontSize: "5px",
        fontFamily: '"Courier New", monospace',
        color: "#ffaa00",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
        backgroundColor: "#0a0a1aDD",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5).setAlpha(0);
    this.add(this.labelText);

    // Vertical pole below the hex (like a sign post)
    const pole = scene.add.graphics();
    pole.lineStyle(1.5, 0x555577, 0.5);
    pole.lineBetween(0, STOP_R - 2, 0, STOP_R + 4);
    this.add(pole);

    this.setSize(STOP_R * 2 + 12, STOP_R * 2 + 20);
    this.setInteractive({ useHandCursor: true });
    this.on("pointerdown", this.onClick, this);
    this.setDepth(5);
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
  }

  activate(): void {
    if (this.isActive || this.completed) return;
    this.isActive = true;
    this.drawStop(TC.active, 1.0);
    this.iconText.setColor(`#${TC.active.toString(16).padStart(6, "0")}`);
    this.drawBeaconRing(TC.active, 0.25);

    this.scene.tweens.add({
      targets: this.labelText, alpha: 1, y: STOP_R + 8,
      duration: 220, ease: "Power2",
    });

    this.pulse = this.scene.tweens.add({
      targets: this.gfx, alpha: 0.7,
      duration: 500, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
    });
  }

  deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.pulse?.destroy();
    this.gfx.setAlpha(1);
    this.drawStop(TC.inactive, 0.6);
    this.iconText.setColor("#ffaa00");
    this.drawBeaconRing(TC.beacon, 0.15);

    this.scene.tweens.add({
      targets: this.labelText, alpha: 0, y: STOP_R + 9,
      duration: 160, ease: "Power2",
    });
  }

  markComplete(): void {
    if (this.completed) return;
    this.completed = true;
    this.deactivate();
    this.drawStop(TC.done, 1.0);
    this.iconText.setText("✓").setColor(`#${TC.done.toString(16).padStart(6, "0")}`);
    this.beaconPulse?.destroy();
    this.beaconRing.setAlpha(0);

    this.scene.tweens.add({
      targets: this, scaleX: 1.3, scaleY: 1.3,
      duration: 160, yoyo: true, ease: "Back.easeOut",
      onComplete: () => this.burstParticles(),
    });
  }

  /** Draw a hexagonal stop marker */
  private drawStop(borderColor: number, borderAlpha: number): void {
    this.gfx.clear();

    // Filled hexagon background
    const pts = this.hexPoints(0, 0, STOP_R);
    this.gfx.fillStyle(TC.ground, 0.85);
    this.gfx.beginPath();
    this.gfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 6; i++) this.gfx.lineTo(pts[i].x, pts[i].y);
    this.gfx.closePath();
    this.gfx.fill();

    // Hex border
    this.gfx.lineStyle(1.5, borderColor, borderAlpha);
    this.gfx.beginPath();
    this.gfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 6; i++) this.gfx.lineTo(pts[i].x, pts[i].y);
    this.gfx.closePath();
    this.gfx.strokePath();

    // Inner circle
    this.gfx.lineStyle(0.8, borderColor, borderAlpha * 0.6);
    this.gfx.strokeCircle(0, 0, INNER_R);

    // Corner dots
    for (const p of pts) {
      this.gfx.fillStyle(borderColor, borderAlpha * 0.7);
      this.gfx.fillCircle(p.x, p.y, 1.2);
    }
  }

  /** Draw the pulsing beacon ring */
  private drawBeaconRing(color: number, alpha: number): void {
    this.beaconRing.clear();
    this.beaconRing.lineStyle(1, color, alpha);
    this.beaconRing.strokeCircle(0, 0, STOP_R + 4);
  }

  /** Get 6 hex vertices */
  private hexPoints(cx: number, cy: number, r: number): Phaser.Math.Vector2[] {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return new Phaser.Math.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a));
    });
  }

  private onClick(): void {
    if (!this.isActive || this.completed) return;
    gameEventBus.emit(GameEvents.TASK_INTERACT, {
      stationId: this.stationId, label: this.label, room: this.room,
    });
    this.scene.tweens.add({ targets: this.iconText, scaleX: 1.4, scaleY: 1.4, duration: 80, yoyo: true });
  }

  private burstParticles(): void {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const p = this.scene.add.circle(this.x, this.y, 2, TC.done, 0.9).setDepth(10);
      this.scene.tweens.add({
        targets: p,
        x: this.x + Math.cos(angle) * 28,
        y: this.y + Math.sin(angle) * 28,
        alpha: 0, duration: 380, ease: "Power3",
        onComplete: () => p.destroy(),
      });
    }
  }
}
