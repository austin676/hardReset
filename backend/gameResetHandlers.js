/**
 * gameResetHandlers.js
 * --------------------
 * Handles the resetGame event — allows a room to play again without
 * everyone leaving and rejoining.
 *
 * Listens for:
 *   resetGame  { roomId }  — any player in the room can request a rematch
 *
 * Emits:
 *   gameReset  (broadcast to room) — clients should return to the lobby screen
 *
 * Resets:
 *   • game_active → false, timer → 180, round → 1, task_progress → 0
 *   • meeting_active → false, sabotage_stations → {}
 *   • All players: alive → true, role → null, tasks_completed → 0,
 *     sabotage_points → 0, vote → null, timeout_until → null
 */

const {
  roomExists,
  setGameActive,
  resetPlayersForGame,
  resetRoomTaskProgress,
  setMeetingActive,
  setSabotageStations,
  getPlayers,
} = require('./state');

const { stopRoomTimer }       = require('./timerHandlers');
const { stopSabotageChecker } = require('./taskHandlers');

// ---------------------------------------------------------------------------
// handleResetGame
// ---------------------------------------------------------------------------

/**
 * handleResetGame
 * Resets all game state for the room so players can start a fresh game
 * from the lobby without reconnecting.
 *
 * @param {object} socket
 * @param {import('socket.io').Server} io
 * @param {object} data
 */
async function handleResetGame(socket, io, data) {
  const { roomId } = data || {};
  console.log(`[gameResetHandlers] resetGame ← socket: ${socket.id} | roomId: ${roomId}`);

  if (!roomId) {
    socket.emit('error', { message: 'resetGame requires roomId.' });
    return;
  }

  try {
    const exists = await roomExists(roomId);
    if (!exists) {
      socket.emit('error', { message: 'Room not found.' });
      return;
    }

    // 1. Stop background processes
    stopRoomTimer(roomId);
    stopSabotageChecker(roomId);

    // 2. Reset room flags
    await setGameActive(roomId, false);        // sets game_active=false, timer=180, round=1
    await setMeetingActive(roomId, false);
    await setSabotageStations(roomId, {});
    await resetRoomTaskProgress(roomId);

    // 3. Reset all player state
    await resetPlayersForGame(roomId);

    // 4. Fetch cleaned player list and broadcast
    const players = await getPlayers(roomId);
    const safeList = players.map(({ socketId, name, avatar, alive }) => ({
      socketId, name, avatar, alive,
    }));

    io.to(roomId).emit('gameReset', {
      roomId,
      players: safeList,
    });

    console.log(
      `[gameResetHandlers] Room ${roomId} RESET — ${players.length} players back to lobby`
    );
  } catch (err) {
    console.error(`[gameResetHandlers] resetGame error:`, err.message);
    socket.emit('error', { message: 'Failed to reset game. Please try again.' });
  }
}

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

function registerGameResetHandlers(socket, io) {
  socket.on('resetGame', (data) => handleResetGame(socket, io, data));
  console.log(`[gameResetHandlers] Handlers registered for socket: ${socket.id}`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  registerGameResetHandlers,
  handleResetGame,
};
