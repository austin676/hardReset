import * as Phaser from "phaser";

// ─── PreloadScene ─────────────────────────────────────────
// Brief branded splash while assets (all procedural) "load".

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload(): void {
    const { width: w, height: h } = this.cameras.main;
    this.cameras.main.setBackgroundColor("#0a0a0a");

    // ── Loading bar ──
    const barW = 200, barH = 8;
    const bx = (w - barW) / 2, by = h / 2 + 20;
    const progress = this.add.graphics();
    const frame = this.add.graphics();
    frame.lineStyle(1, 0x334155).strokeRect(bx, by, barW, barH);

    this.load.on("progress", (v: number) => {
      progress.clear().fillStyle(0x00ffff, 0.8).fillRect(bx, by, barW * v, barH);
    });
    this.load.on("complete", () => { progress.destroy(); frame.destroy(); });

    // ── Title text ──
    this.add.text(w / 2, h / 2 - 30, "hardReset", {
      fontSize: "24px", fontFamily: "monospace",
      color: "#00ffff", stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(w / 2, h / 2 - 8, "Initializing facility...", {
      fontSize: "8px", fontFamily: "monospace", color: "#64748b",
    }).setOrigin(0.5);

    // Emit a tiny dummy load so the progress callback fires once
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0).fillRect(0, 0, 1, 1);
    g.generateTexture("_blank", 1, 1);
    g.destroy();
  }

  create(): void {
    this.time.delayedCall(500, () => this.scene.start("MainScene"));
  }
}
