// ─── Shared type definitions for the hardReset game world ───
// Theme: Cyberpunk facility — Agents vs Hackers

export type Direction = "up" | "down" | "left" | "right";

export type PlayerRole = "agent" | "hacker";

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  direction: Direction;
  isMoving: boolean;
  role: PlayerRole;
  name: string;
  color: number;
  alive: boolean;
}

export interface TaskStationConfig {
  id: string;
  tileX: number;
  tileY: number;
  label: string;
  room: string;
  icon: string;
}

export interface RoomConfig {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floorColor: number;
}

export interface TaskProgress {
  id: string;
  label: string;
  completed: boolean;
}

export interface MeetingPlayer {
  id: string;
  name: string;
  color: number;
  alive: boolean;
  voted: boolean;
  votes: number;
}

// 0=wall, 1=floor, 2=portal, 3=task
export type TileType = 0 | 1 | 2 | 3;

export type MapTheme = "castle" | "scifi" | "neon";

export interface PortalConfig {
  tileX: number;
  tileY: number;
  targetMap: string;
  targetTileX: number;
  targetTileY: number;
  label: string;
}

export interface MapConfig {
  id: string;
  name: string;
  theme: MapTheme;
  trimColor: number;
  floorColor: number;
  grid: TileType[][];           // 16×16
  portals: PortalConfig[];
  tasks: TaskStationConfig[];
  spawnX: number;
  spawnY: number;
}

export const MAP_SIZE = 16; // each map is 16×16 tiles

export enum GameEvents {
  PLAYER_MOVE = "player:move",
  TASK_INTERACT = "task:interact",
  OPEN_PUZZLE = "puzzle:open",
  TASK_COMPLETE = "task:complete",
  TASK_MODAL_CLOSE = "task:modal:close",
  CALL_MEETING = "meeting:call",
  CAST_VOTE = "meeting:vote",
  REPORT_BODY = "report:body",
  SABOTAGE = "sabotage:trigger",

  PLAYER_JOIN = "player:join",
  PLAYER_LEAVE = "player:leave",
  REMOTE_PLAYER_MOVE = "remote:player:move",
  MEETING_START = "meeting:start",
  MEETING_END = "meeting:end",
  TIMEOUT = "timeout",
  PLAYER_KILLED = "player:killed",
  SABOTAGE_ALERT = "sabotage:alert",
  TASK_PROGRESS_UPDATE = "task:progress:update",
  HUD_ROOM_CHANGE = "hud:room:change",
  HUD_NEAR_STATION = "hud:near:station",
  MAP_CHANGE = "map:change",
}

export const PLAYER_COLORS: { name: string; hex: number }[] = [
  { name: "Red", hex: 0xef4444 },
  { name: "Blue", hex: 0x3b82f6 },
  { name: "Green", hex: 0x22c55e },
  { name: "Pink", hex: 0xec4899 },
  { name: "Orange", hex: 0xf97316 },
  { name: "Yellow", hex: 0xeab308 },
  { name: "Cyan", hex: 0x06b6d4 },
  { name: "Purple", hex: 0xa855f7 },
  { name: "Lime", hex: 0x84cc16 },
  { name: "White", hex: 0xf1f5f9 },
];

export const TILE = 16;
