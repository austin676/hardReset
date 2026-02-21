import * as Phaser from "phaser";
import { gameEventBus } from "../GameEventBus";
import { GameEvents } from "../types/game.types";

//  TaskStation 
// Rectangular terminal screen — matches the Among Us console
// aesthetic. Shows a colored border, screen content, and glows
// when the player is in range.

const TW = 20;  // terminal width  (px)
const TH = 15;  // terminal height (px)

const TC = {
  inactive: 0x334155,
  active:   0x00fff0,
  done:     0x39ff14,
  screen:   0x0d1117,
} as const;

export class TaskStation extends Phaser.GameObjects.Container {
  readonly stationId: string;
  readonly label: string;
  readonly room: string;
  completed = false;

  private termGfx: Phaser.GameObjects.Graphics;
  private screenText: Phaser.GameObjects.Text;
  private labelText: Phaser.GameObjects.Text;
  private isActive = false;
  private pulse?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    id: string, label: string, room: string, icon: string,
  ) {
    super(scene, x, y);
    this.stationId = id;
    this.label = label;
    this.room = room;

    this.termGfx = scene.add.graphics();
    this.add(this.termGfx);
    this.drawTerminal(TC.inactive, 0.4);

    this.screenText = scene.add
      .text(0, -1, icon, {
        fontSize: "8px",
        fontFamily: '"Courier New", monospace',
        color: "#334155",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.add(this.screenText);

    this.labelText = scene.add
      .text(0, TH / 2 + 7, label, {
        fontSize: "5px",
        fontFamily: '"Courier New", monospace',
        color: "#00fff0",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
        backgroundColor: "#00000099",
        padding: { x: 2, y: 1 },
      })
      .setOrigin(0.5).setAlpha(0);
    this.add(this.labelText);

    this.setSize(TW + 10, TH + 14);
    this.setInteractive({ useHandCursor: true });
    this.on("pointerdown", this.onClick, this);
    this.setDepth(5);
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
  }

  activate(): void {
    if (this.isActive || this.completed) return;
    this.isActive = true;
    this.drawTerminal(TC.active, 0.9);
    this.screenText.setColor(`#${TC.active.toString(16).padStart(6, "0")}`);

    this.scene.tweens.add({
      targets: this.labelText, alpha: 1, y: TH / 2 + 6,
      duration: 220, ease: "Power2",
    });

    this.pulse = this.scene.tweens.add({
      targets: this.termGfx, alpha: 0.6,
      duration: 600, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
    });
  }

  deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.pulse?.destroy();
    this.termGfx.setAlpha(1);
    this.drawTerminal(TC.inactive, 0.4);
    this.screenText.setColor("#334155");

    this.scene.tweens.add({
      targets: this.labelText, alpha: 0, y: TH / 2 + 7,
      duration: 160, ease: "Power2",
    });
  }

  markComplete(): void {
    if (this.completed) return;
    this.completed = true;
    this.deactivate();
    this.drawTerminal(TC.done, 0.9);
    this.screenText.setText("OK").setColor(`#${TC.done.toString(16).padStart(6, "0")}`);

    this.scene.tweens.add({
      targets: this, scaleX: 1.25, scaleY: 1.25,
      duration: 160, yoyo: true, ease: "Back.easeOut",
      onComplete: () => this.burstParticles(),
    });
  }

  private drawTerminal(borderColor: number, borderAlpha: number): void {
    this.termGfx.clear();
    this.termGfx.fillStyle(TC.screen, 0.92).fillRect(-TW / 2, -TH / 2, TW, TH);
    this.termGfx.lineStyle(1.5, borderColor, borderAlpha).strokeRect(-TW / 2, -TH / 2, TW, TH);
    this.termGfx.fillStyle(borderColor, borderAlpha * 0.4).fillRect(-TW / 2, -TH / 2, TW, 3);
    this.termGfx.lineStyle(0.3, 0xffffff, 0.04);
    for (let i = 1; i < TH / 2; i += 2)
      this.termGfx.lineBetween(-TW / 2, -TH / 2 + i * 2, TW / 2, -TH / 2 + i * 2);
  }

  private onClick(): void {
    if (!this.isActive || this.completed) return;
    gameEventBus.emit(GameEvents.TASK_INTERACT, {
      stationId: this.stationId, label: this.label, room: this.room,
    });
    this.scene.tweens.add({ targets: this.screenText, scaleX: 1.3, scaleY: 1.3, duration: 80, yoyo: true });
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
