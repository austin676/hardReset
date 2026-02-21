import * as Phaser from "phaser";
import { gameEventBus } from "../GameEventBus";
import { GameEvents, type MeetingPlayer } from "../types/game.types";

// ─── MeetingScene ─────────────────────────────────────────
// "Who Is The Hacker?" voting overlay — cyberpunk terminal look.

export class MeetingScene extends Phaser.Scene {
  private panel!: Phaser.GameObjects.Container;
  private slots: Phaser.GameObjects.Container[] = [];
  private timerText!: Phaser.GameObjects.Text;
  private timerEvent?: Phaser.Time.TimerEvent;
  private votingTime = 30;

  private demoPlayers: MeetingPlayer[] = [
    { id: "1", name: "You",    color: 0x3b82f6, alive: true,  voted: false, votes: 0 },
    { id: "2", name: "Cipher", color: 0xef4444, alive: true,  voted: false, votes: 0 },
    { id: "3", name: "Ghost",  color: 0x22c55e, alive: true,  voted: false, votes: 0 },
    { id: "4", name: "Neon",   color: 0xec4899, alive: false, voted: false, votes: 0 },
    { id: "5", name: "Byte",   color: 0xf97316, alive: true,  voted: false, votes: 0 },
    { id: "6", name: "Flux",   color: 0xa855f7, alive: true,  voted: false, votes: 0 },
  ];

  constructor() { super({ key: "MeetingScene" }); }

  create(): void {
    const { width: w, height: h } = this.cameras.main;
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.7);
    this.panel = this.add.container(w / 2, h / 2);

    this.drawHeader();
    this.drawGrid();
    this.drawTimer();
    this.drawSkip();

    // animate in
    this.panel.setScale(0.8).setAlpha(0);
    this.tweens.add({ targets: this.panel, scaleX: 1, scaleY: 1, alpha: 1, duration: 350, ease: "Back.easeOut" });
  }

  /* ── Header ─── */
  private drawHeader(): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.95).fillRoundedRect(-280, -200, 560, 400, 12);
    bg.lineStyle(2, 0x00ffff, 0.4).strokeRoundedRect(-280, -200, 560, 400, 12);
    this.panel.add(bg);
    this.panel.add(this.add.text(0, -175, "WHO IS THE HACKER?", { fontSize: "16px", fontFamily: "monospace", color: "#00ffff", stroke: "#000", strokeThickness: 2 }).setOrigin(0.5));
    this.panel.add(this.add.text(0, -155, "Emergency meeting called", { fontSize: "8px", fontFamily: "monospace", color: "#94a3b8" }).setOrigin(0.5));
  }

  /* ── Player grid (2 cols) ─── */
  private drawGrid(): void {
    const startY = -120, colW = 240, rowH = 48;
    this.demoPlayers.forEach((p, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = -colW / 2 + col * colW;
      const y = startY + row * rowH;
      const slot = this.makeSlot(x, y, p);
      this.panel.add(slot);
      this.slots.push(slot);
    });
  }

  private makeSlot(x: number, y: number, p: MeetingPlayer): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(p.alive ? 0x1e293b : 0x0f0f0f, 0.8).fillRoundedRect(-105, -18, 210, 36, 6);
    if (p.alive) bg.lineStyle(1, 0x334155, 0.5).strokeRoundedRect(-105, -18, 210, 36, 6);
    c.add(bg);

    // Bean mini-icon
    const dot = this.add.graphics();
    const a = p.alive ? 1 : 0.3;
    dot.fillStyle(p.color, a).fillRoundedRect(-90, -10, 16, 20, 4);
    dot.fillStyle(0x93c5fd, a * 0.8).fillRect(-88, -6, 8, 4);
    c.add(dot);

    c.add(this.add.text(-65, -4, p.name, { fontSize: "9px", fontFamily: "monospace", color: p.alive ? "#f1f5f9" : "#4a5568" }).setOrigin(0, 0.5));

    if (!p.alive) {
      c.add(this.add.text(-65, 6, "DISCONNECTED", { fontSize: "5px", fontFamily: "monospace", color: "#ef4444" }).setOrigin(0, 0.5));
      const line = this.add.graphics(); line.lineStyle(1, 0xef4444, 0.5).lineBetween(-65, -2, -20, -2); c.add(line);
    }

    if (p.alive && p.id !== "1") {
      const vbg = this.add.graphics();
      vbg.fillStyle(0x1e40af, 0.6).fillRoundedRect(55, -12, 40, 24, 4);
      vbg.lineStyle(1, 0x3b82f6, 0.5).strokeRoundedRect(55, -12, 40, 24, 4);
      c.add(vbg);
      const vt = this.add.text(75, 0, "VOTE", { fontSize: "7px", fontFamily: "monospace", color: "#93c5fd" }).setOrigin(0.5);
      c.add(vt);
      const hit = this.add.rectangle(75, 0, 40, 24, 0, 0).setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => {
        gameEventBus.emit(GameEvents.CAST_VOTE, { targetId: p.id });
        vt.setText("✓").setColor("#22c55e");
        this.slots.forEach(s => s.list.forEach((ch: any) => { if (ch.input) ch.disableInteractive(); }));
      });
      c.add(hit);
    }
    return c;
  }

  /* ── Timer ─── */
  private drawTimer(): void {
    this.timerText = this.add.text(0, 160, `Voting: ${this.votingTime}s`, { fontSize: "10px", fontFamily: "monospace", color: "#fbbf24" }).setOrigin(0.5);
    this.panel.add(this.timerText);
    let rem = this.votingTime;
    this.timerEvent = this.time.addEvent({
      delay: 1000, repeat: this.votingTime - 1,
      callback: () => { rem--; this.timerText.setText(`Voting: ${rem}s`); if (rem <= 5) this.timerText.setColor("#ef4444"); if (rem <= 0) this.endMeeting(); },
    });
  }

  /* ── Skip ─── */
  private drawSkip(): void {
    const g = this.add.graphics();
    g.fillStyle(0x374151, 0.8).fillRoundedRect(-50, 175, 100, 28, 6);
    g.lineStyle(1, 0x6b7280).strokeRoundedRect(-50, 175, 100, 28, 6);
    this.panel.add(g);
    const t = this.add.text(0, 189, "SKIP VOTE", { fontSize: "8px", fontFamily: "monospace", color: "#9ca3af" }).setOrigin(0.5);
    this.panel.add(t);
    const hit = this.add.rectangle(0, 189, 100, 28, 0, 0).setInteractive({ useHandCursor: true }).setOrigin(0.5);
    hit.on("pointerdown", () => { gameEventBus.emit(GameEvents.CAST_VOTE, { targetId: "skip" }); t.setText("Skipped ✓").setColor("#22c55e"); hit.disableInteractive(); });
    this.panel.add(hit);
  }

  /* ── End ─── */
  private endMeeting(): void {
    this.timerEvent?.destroy();
    this.tweens.add({
      targets: this.panel, alpha: 0, scaleX: 0.8, scaleY: 0.8, duration: 250,
      onComplete: () => { gameEventBus.emit(GameEvents.MEETING_END, {}); this.scene.resume("MainScene"); this.scene.stop("MeetingScene"); },
    });
  }
}
