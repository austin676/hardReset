import * as Phaser from "phaser";

// ─── Singleton event bus bridging React ↔ Phaser ↔ backend ───
//
// Usage from anywhere:
//   import { gameEventBus } from "~/game/GameEventBus";
//   gameEventBus.emit(GameEvents.PLAYER_MOVE, payload);
//   gameEventBus.on(GameEvents.MEETING_START, handler);
//
// The backend socket layer simply calls gameEventBus.emit(...)
// when messages arrive — no Phaser import needed in socket code.

export const gameEventBus = new Phaser.Events.EventEmitter();
