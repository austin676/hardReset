/**
 * movementHandlers.js
 * -------------------
 * Module 3: Real-time player movement synchronisation.
 *
 * Listens for:
 *   playerMove — client sends its new (x, y) each movement frame
 *
 * Emits:
 *   playerMoved — broadcast to the rest of the room (NOT back to sender)
 *
 * Guards:
 *   - Player must exist and belong to the room
 *   - Player must be alive
 *   - No movement during an active meeting
 *   - Position values must be finite numbers
 *   - Per-socket throttle: max 1 DB write + broadcast per THROTTLE_MS
 *   - Position delta threshold: skip broadcast if barely moved
 */

const {
  roomExists,
  getPlayerState,
  isMeetingActive,
  updatePlayerPosition,
} = require('./state');

const { isPlayerTimedOut } = require('./timerUtils');

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/**
 * Minimum time (ms) between accepted movement updates per socket.
 * 50 ms → max 20 position updates/sec, well within Socket.io's capacity.
 */
const THROTTLE_MS = 50;

/**
 * Minimum Euclidean distance a player must move before the update is
 * persisted and broadcast. Filters micro-jitter from gamepad/touch input.
 */
const MIN_MOVE_DELTA = 1; // pixels / game units

/**
 * Optional map boundary.  Set to null to disable bounds checking.
 * Adjust to match your Phaser world size.
 */
const MAP_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 2400,
  maxY: 1600,
};

// ---------------------------------------------------------------------------
// Per-socket throttle store
// In-memory only — timestamps are ephemeral and don't need persistence.
// ---------------------------------------------------------------------------

/** @type {Map<string, { lastMs: number, lastX: number, lastY: number }>} */
const throttleMap = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * clamp
 * Restricts a value to [min, max].
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * applyBounds
 * Clamps (x, y) to MAP_BOUNDS if bounds checking is enabled.
 *
 * @param {number} x
 * @param {number} y
 * @returns {{ x: number, y: number }}
 */
function applyBounds(x, y) {
  if (!MAP_BOUNDS) return { x, y };
  return {
    x: clamp(x, MAP_BOUNDS.minX, MAP_BOUNDS.maxX),
    y: clamp(y, MAP_BOUNDS.minY, MAP_BOUNDS.maxY),
  };
}

/**
 * euclideanDistance
 * Fast distance calculation — avoids sqrt for threshold comparison.
 * Compares squared distance to (threshold²) to save the sqrt call.
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number} actual distance
 */
function euclideanDistance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ---------------------------------------------------------------------------
// Event: playerMove
// ---------------------------------------------------------------------------

/**
 * handlePlayerMove
 * Core movement handler — validates, throttles, persists, and broadcasts.
 *
 * Expected payload:
 *   { roomId: string, x: number, y: number }
 *
 * Broadcasts to room (excluding sender):
 *   playerMoved → { socketId, position: { x, y } }
 *
 * @param {object} socket
 * @param {object} io
 * @param {object} data
 */
async function handlePlayerMove(socket, io, data) {
  // Defensive parse in case Postman / old client sends a raw string
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (_) { data = {}; }
  }

  const { roomId, x, y, direction } = data || {};

  // --- Guard: required fields -----------------------------------------------
  if (!roomId) {
    console.warn(`[movementHandlers] DROPPED — no roomId (${socket.id})`);
    return;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    console.warn(`[movementHandlers] DROPPED — invalid coords x=${x} y=${y} (${socket.id})`);
    return;
  }

  // --- Throttle: drop events arriving too fast from this socket -------------
  const now      = Date.now();
  const throttle = throttleMap.get(socket.id);

  if (throttle && now - throttle.lastMs < THROTTLE_MS) {
    return; // Too soon — silently drop
  }

  // --- Delta threshold: ignore micro-movements ------------------------------
  if (throttle) {
    const delta = euclideanDistance(throttle.lastX, throttle.lastY, x, y);
    if (delta < MIN_MOVE_DELTA) {
      return;
    }
  }

  // --- Apply optional map bounds ----------------------------------------
  const bounded = applyBounds(x, y);

  // Update throttle record immediately (before any async work)
  throttleMap.set(socket.id, { lastMs: now, lastX: bounded.x, lastY: bounded.y });

  // --- Validate, broadcast, and persist ------------------------------------
  // We need to check timeout before broadcasting, so we do a quick async
  // validation up-front. The tradeoff: one DB read before broadcast.
  ;(async () => {
    try {
      const [exists, player, meeting] = await Promise.all([
        roomExists(roomId),
        getPlayerState(socket.id),
        isMeetingActive(roomId),
      ]);
      if (!exists || !player || !player.alive || meeting) return;

      // Block movement if the player is timed out
      if (isPlayerTimedOut(player)) return;

      // Broadcast to everyone else in the room
      socket.to(roomId).emit('playerMoved', {
        socketId:  socket.id,
        position:  { x: bounded.x, y: bounded.y },
        direction: direction ?? 'down',
      });

      // Persist position to DB (fire-and-forget within this async block)
      await updatePlayerPosition(roomId, socket.id, bounded.x, bounded.y);
    } catch (err) {
      console.error(`[movementHandlers] movement processing error (${socket.id}):`, err.message);
    }
  })();
}

/**
 * handleMovementDisconnect
 * Cleans up the throttle entry when a socket disconnects.
 * Prevents the throttleMap from growing indefinitely.
 *
 * @param {object} socket
 */
function handleMovementDisconnect(socket) {
  throttleMap.delete(socket.id);
  console.log(`[movementHandlers] Throttle cleared for socket: ${socket.id}`);
}

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

/**
 * registerMovementHandlers
 * Binds movement-related event listeners to a socket.
 * Call alongside registerRoomHandlers and registerRoleHandlers.
 *
 * @param {object} socket
 * @param {object} io
 */
function registerMovementHandlers(socket, io) {
  socket.on('playerMove',   (data) => handlePlayerMove(socket, io, data));
  socket.on('disconnect',   ()     => handleMovementDisconnect(socket));

  console.log(`[movementHandlers] Handlers registered for socket: ${socket.id}`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  registerMovementHandlers,
  handlePlayerMove,    // exported for unit testing
};
