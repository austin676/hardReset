import * as Phaser from "phaser";
import type { Direction, PlayerRole } from "../types/game.types";
import { ensurePlayerTextures } from "./Player";

// ─── RemotePlayer ─────────────────────────────────────────
// Network-driven player using the same per-frame canvas textures
// and per-colour animations as the local Player.

export class RemotePlayer extends Phaser.GameObjects.Container {
  playerId: string;
  direction: Direction = "down";
  role: PlayerRole = "agent";
  alive = true;

  private sprite: Phaser.GameObjects.Sprite;
  private nameLabel: Phaser.GameObjects.Text;
  private baseKey: string;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    id: string, name: string, role: PlayerRole = "agent",
    color = 0xef4444,
  ) {
    super(scene, x, y);
    this.playerId = id;
    this.role = role;

    // Generate (or reuse) per-colour textures + animations
    this.baseKey = ensurePlayerTextures(scene, color);

    this.sprite = scene.add.sprite(0, 0, `${this.baseKey}_0`);
    this.add(this.sprite);

    this.nameLabel = scene.add
      .text(0, -14, name, {
        fontSize: "7px", fontFamily: "monospace",
        color: "#e2e8f0", stroke: "#000", strokeThickness: 2,
      })
      .setOrigin(0.5);
    this.add(this.nameLabel);

    this.setDepth(5);
    scene.add.existing(this);
  }

  moveToPosition(x: number, y: number, direction: Direction): void {
    this.direction = direction;
    const animKey = `${this.baseKey}_walk_${direction}`;
    if (this.sprite.anims?.currentAnim?.key !== animKey && this.scene.anims.exists(animKey)) {
      this.sprite.anims.play(animKey, true);
    }
    this.scene.tweens.add({
      targets: this, x, y, duration: 150, ease: "Linear",
      onComplete: () => {
        const idleKey = `${this.baseKey}_idle_${direction}`;
        if (this.scene.anims.exists(idleKey)) {
          this.sprite.anims.play(idleKey, true);
        }
      },
    });
  }

  kill(): void  { this.alive = false; this.setAlpha(0.3); }
  setRole(r: PlayerRole): void { this.role = r; }
}
