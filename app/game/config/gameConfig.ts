import * as Phaser from "phaser";
import { PreloadScene } from "../scenes/PreloadScene";
import { MainScene } from "../scenes/MainScene";
import { HUDScene } from "../scenes/HUDScene";
import { MeetingScene } from "../scenes/MeetingScene";

export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: "#0a0a0a",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  input: {
    keyboard: true,
    mouse: true,
    touch: true,
  },
  scene: [PreloadScene, MainScene, HUDScene, MeetingScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};
