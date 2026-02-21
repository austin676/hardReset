/**
 * timerHandlers.js
 * ----------------
 * Module 4 — Round Timer Management and Player Timeout Effects.
 *
 * Responsibilities:
 *   • Maintain a per-room countdown (setInterval) that ticks every second.
 *   • Broadcast `timerUpdate` to all room members each tick.
 *   • Emit `roundEnd` when the countdown reaches 0 and advance round state.
 *   • Provide `applyTimeout` to freeze a single player for a fixed duration.
 *   • Provide `stopRoomTimer` so roomHandlers can clean up on room deletion.
 *
 * Timer state is entirely in-memory (ephemeral) — intentionally NOT persisted
 * to Supabase. If the server restarts, games reset anyway.
 *
 * DB side-effects use helpers from state.js (setRoomTimer, incrementRound).
 */

const { ROUND_DURATION, buildTimeoutUntil } = require('./timerUtils');
const {
  setRoomTimer,
  incrementRound,
  setPlayerTimeout,
  clearPlayerTimeout,
} = require('./state');

// ---------------------------------------------------------------------------
// In-memory timer registry
// { [roomId]: { intervalId, currentTick } }
// ---------------------------------------------------------------------------
const roomTimers = {};

// Stores the tick value saved by pauseRoundTimer so resumeRoundTimer can
// restart the countdown from the same point.
// { [roomId]: number }
const pausedTicks = {};

// ---------------------------------------------------------------------------
// startRoundTimer
// ---------------------------------------------------------------------------

/**
 * startRoundTimer
 * Begins a 1-second countdown for the given room.
 * Guard: if a timer is already running for this room it is stopped first
 * (prevents duplicate intervals if startGame is somehow called twice).
 *
 * Each tick:
 *  1. Decrements in-memory tick counter.
 *  2. Persists the new timer value to Supabase via setRoomTimer.
 *  3. Broadcasts `timerUpdate` to the whole room.
 *  4. When tick reaches 0: broadcasts `roundEnd`, increments round in DB,
 *     resets tick to ROUND_DURATION for the next round, and broadcasts the
 *     new round's `timerUpdate`.
 *
 * @param {string} roomId
 * @param {import('socket.io').Server} io
 */
/**
 * startRoundTimer
 * @param {string} roomId
 * @param {import('socket.io').Server} io
 * @param {number} [initialTick]  Optional starting tick (defaults to ROUND_DURATION).
 *                                Pass a value to resume from a paused position.
 */
function startRoundTimer(roomId, io, initialTick = ROUND_DURATION) {
  // Clean up any existing timer for this room
  stopRoomTimer(roomId);

  let tick = initialTick;

  const intervalId = setInterval(async () => {
    tick -= 1;

    try {
      // Persist current timer value to DB (best-effort; don't crash on failure)
      await setRoomTimer(roomId, tick);
    } catch (err) {
      console.error(`[timerHandlers] setRoomTimer failed for ${roomId}:`, err.message);
    }

    // Broadcast current timer to all room members
    io.to(roomId).emit('timerUpdate', { roomId, timer: tick });

    if (tick <= 0) {
      // -------------------------------------------------------------------
      // Round has ended
      // -------------------------------------------------------------------
      console.log(`[timerHandlers] Round ended in room: ${roomId}`);
      io.to(roomId).emit('roundEnd', { roomId });

      try {
        // Increment round counter and reset timer column to ROUND_DURATION
        await incrementRound(roomId);
      } catch (err) {
        console.error(`[timerHandlers] incrementRound failed for ${roomId}:`, err.message);
      }

      // Reset tick for the next round and immediately notify clients
      tick = ROUND_DURATION;
      io.to(roomId).emit('timerUpdate', { roomId, timer: tick });

      console.log(`[timerHandlers] New round started in room: ${roomId}`);
    }
  }, 1_000);

  roomTimers[roomId] = { intervalId, get currentTick() { return tick; } };
  console.log(`[timerHandlers] Timer STARTED for room: ${roomId} | tick: ${initialTick}s`);
}

// ---------------------------------------------------------------------------
// pauseRoundTimer
// ---------------------------------------------------------------------------

/**
 * pauseRoundTimer
 * Snapshots the current tick then stops the interval.
 * The saved tick is consumed by the next resumeRoundTimer call.
 * Safe to call when no timer is running (no-op).
 *
 * @param {string} roomId
 */
function pauseRoundTimer(roomId) {
  const current = roomTimers[roomId]?.currentTick;
  if (current === undefined) {
    console.warn(`[timerHandlers] pauseRoundTimer — no running timer for room: ${roomId}`);
    return;
  }
  pausedTicks[roomId] = current;
  stopRoomTimer(roomId); // clears roomTimers[roomId]
  console.log(`[timerHandlers] Timer PAUSED for room: ${roomId} | saved tick: ${current}s`);
}

// ---------------------------------------------------------------------------
// resumeRoundTimer
// ---------------------------------------------------------------------------

/**
 * resumeRoundTimer
 * Restarts the countdown from the tick saved by pauseRoundTimer.
 * Falls back to ROUND_DURATION if no paused tick exists.
 * Cleans up the pausedTicks entry after use.
 *
 * @param {string} roomId
 * @param {import('socket.io').Server} io
 */
function resumeRoundTimer(roomId, io) {
  const savedTick = pausedTicks[roomId] ?? ROUND_DURATION;
  delete pausedTicks[roomId];
  startRoundTimer(roomId, io, savedTick);
  console.log(`[timerHandlers] Timer RESUMED for room: ${roomId} from tick: ${savedTick}s`);
}

// ---------------------------------------------------------------------------
// stopRoomTimer
// ---------------------------------------------------------------------------

/**
 * stopRoomTimer
 * Cancels the active interval for a room and removes it from the registry.
 * Safe to call even if no timer is running (no-op).
 *
 * Call this from roomHandlers when a room is deleted (last player leaves).
 *
 * @param {string} roomId
 */
function stopRoomTimer(roomId) {
  if (!roomTimers[roomId]) return;
  clearInterval(roomTimers[roomId].intervalId);
  delete roomTimers[roomId];
  console.log(`[timerHandlers] Timer STOPPED for room: ${roomId}`);
}

// ---------------------------------------------------------------------------
// applyTimeout
// ---------------------------------------------------------------------------

/**
 * applyTimeout
 * Temporarily freezes a player by recording a `timeout_until` timestamp in
 * Supabase. The movement handler reads `timeoutUntil` on every move event and
 * drops it while the timeout is active.
 *
 * Emits `timeoutStarted` privately to the affected socket so the client can
 * display a countdown overlay.
 * Emits `playerTimedOut` to the rest of the room so others can see the effect.
 *
 * @param {string} roomId
 * @param {string} socketId  - The socket that is being timed out.
 * @param {number} seconds   - Timeout duration in seconds. Default: 30.
 * @param {import('socket.io').Server} io
 */
async function applyTimeout(roomId, socketId, seconds = 30, io) {
  const timeoutUntil = buildTimeoutUntil(seconds);

  try {
    await setPlayerTimeout(socketId, timeoutUntil);
    console.log(
      `[timerHandlers] Timeout applied → socket: ${socketId} | until: ${timeoutUntil}`
    );
  } catch (err) {
    console.error(`[timerHandlers] setPlayerTimeout failed:`, err.message);
    return; // Don't emit if DB write failed
  }

  // Notify the timed-out player
  io.to(socketId).emit('timeoutStarted', {
    socketId,
    roomId,
    seconds,
    timeoutUntil,
  });

  // Notify the rest of the room
  io.to(roomId).except(socketId).emit('playerTimedOut', {
    socketId,
    roomId,
    seconds,
  });
}

// ---------------------------------------------------------------------------
// clearTimeout (exposed for future use by meeting/voting logic)
// ---------------------------------------------------------------------------

/**
 * removeTimeout
 * Removes an active timeout from a player, immediately re-enabling movement.
 * Emits `timeoutCleared` to the affected socket.
 *
 * @param {string} socketId
 * @param {import('socket.io').Server} io
 */
async function removeTimeout(socketId, io) {
  try {
    await clearPlayerTimeout(socketId);
  } catch (err) {
    console.error(`[timerHandlers] clearPlayerTimeout failed:`, err.message);
    return;
  }
  io.to(socketId).emit('timeoutCleared', { socketId });
  console.log(`[timerHandlers] Timeout cleared for socket: ${socketId}`);
}

// ---------------------------------------------------------------------------
// getRoomTimerState  (debug / inspection helper)
// ---------------------------------------------------------------------------

/**
 * getRoomTimerState
 * Returns the current tick value for a room, or null if no timer is running.
 * Useful for debugging and for emitting the current time to a newly joined socket.
 *
 * @param {string} roomId
 * @returns {number|null}
 */
function getRoomTimerState(roomId) {
  return roomTimers[roomId]?.currentTick ?? null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  startRoundTimer,
  stopRoomTimer,
  pauseRoundTimer,
  resumeRoundTimer,
  applyTimeout,
  removeTimeout,
  getRoomTimerState,
};
