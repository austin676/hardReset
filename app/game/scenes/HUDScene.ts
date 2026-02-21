import * as Phaser from "phaser";

// HUDScene is intentionally empty — UI is handled by the React GameHUD overlay.
export class HUDScene extends Phaser.Scene {
  constructor() { super({ key: "HUDScene" }); }
  create(): void {}
}
