/**
 * roleHandlers.js
 * ---------------
 * Socket.io event handlers for Module 2: Game Start & Role Assignment.
 *
 * Listens for:
 *   startGame — host triggers game start
 *
 * Emits:
 *   roleAssigned      (private, per socket) — role + impostor teammates if impostor
 *   gameStarted       (broadcast to room)   — full player list with roles
 *   timerUpdate       (broadcast to room)   — initial timer value
 *   error             (private)             — validation failures
 */

const { startRoundTimer } = require('./timerHandlers');

const {
  roomExists,
  getPlayers,
  getPlayerSocketIds,
  isGameStarted,
  setGameActive,
  resetPlayersForGame,
  updatePlayerRole,
} = require('./state');

const { assignRoles, ROLES } = require('./roleUtils');

// ---------------------------------------------------------------------------
// Minimum players required to start
// ---------------------------------------------------------------------------
const MIN_PLAYERS = 3;

// ---------------------------------------------------------------------------
// Event: startGame
// ---------------------------------------------------------------------------

/**
 * handleStartGame
 * Triggered when the host emits `startGame`.
 *
 * Expected payload:
 *   { roomId: string }
 *
 * Flow:
 *   1. Validate room exists
 *   2. Validate minimum player count
 *   3. Guard against duplicate startGame calls
 *   4. Reset all player fields (alive, tasks, vote, role)
 *   5. Assign roles via roleUtils
 *   6. Persist each role to Supabase
 *   7. Emit private `roleAssigned` to each socket
 *   8. Mark room as game_active (also resets timer to 180)
 *   9. Broadcast `gameStarted` and `timerUpdate` to room
 *
 * @param {object} socket
 * @param {object} io
 * @param {object} data
 */
async function handleStartGame(socket, io, data) {
  // Defensive parse — Postman sometimes sends JSON as a raw string
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (_) { data = {}; }
  }

  console.log(`[roleHandlers] startGame raw data:`, data);

  const { roomId } = data || {};

  // --- Guard: roomId provided -----------------------------------------------
  if (!roomId) {
    socket.emit('error', { message: 'roomId is required to start a game.' });
    console.warn(`[roleHandlers] startGame rejected — no roomId (socket: ${socket.id})`);
    return;
  }

  try {
    // --- Guard: room must exist ----------------------------------------------
    const exists = await roomExists(roomId);
    if (!exists) {
      socket.emit('error', { message: `Room "${roomId}" does not exist.` });
      console.warn(`[roleHandlers] startGame rejected — room not found: ${roomId}`);
      return;
    }

    // --- Guard: prevent duplicate startGame calls ----------------------------
    // Once game_active is true, startGame is a no-op until the room resets.
    const alreadyStarted = await isGameStarted(roomId);
    if (alreadyStarted) {
      socket.emit('error', { message: 'Game has already started in this room.' });
      console.warn(`[roleHandlers] startGame rejected — already active: ${roomId}`);
      return;
    }

    // --- Guard: minimum player count -----------------------------------------
    const socketIds = await getPlayerSocketIds(roomId);
    if (socketIds.length < MIN_PLAYERS) {
      socket.emit('error', {
        message: `Need at least ${MIN_PLAYERS} players to start. Currently: ${socketIds.length}.`,
      });
      console.warn(
        `[roleHandlers] startGame rejected — not enough players: ${socketIds.length}/${MIN_PLAYERS} (room: ${roomId})`
      );
      return;
    }

    // -------------------------------------------------------------------------
    // 1. Reset all player fields so a rematch starts cleanly
    // -------------------------------------------------------------------------
    await resetPlayersForGame(roomId);

    // -------------------------------------------------------------------------
    // 2. Assign roles (pure, in-memory shuffle + distribution)
    // -------------------------------------------------------------------------
    const { assignments, impostors } = assignRoles(socketIds);

    // -------------------------------------------------------------------------
    // 3. Persist each role to Supabase
    // -------------------------------------------------------------------------
    await Promise.all(
      Object.entries(assignments).map(([socketId, role]) =>
        updatePlayerRole(socketId, role)
      )
    );

    // -------------------------------------------------------------------------
    // 4. Emit PRIVATE roleAssigned to each socket
    //    Crewmates do NOT receive the impostor list.
    // -------------------------------------------------------------------------
    const players = await getPlayers(roomId); // fresh from DB with roles set

    for (const player of players) {
      const isImpostor = assignments[player.socketId] === ROLES.IMPOSTOR;

      const privatePayload = {
        role:   assignments[player.socketId],
        round:  1,
        // Impostors learn their teammates; crewmates get an empty array
        impostorTeammates: isImpostor
          ? impostors
              .filter((id) => id !== player.socketId)
              .map((id) => {
                const teammate = players.find((p) => p.socketId === id);
                return { socketId: id, name: teammate?.name ?? 'Unknown' };
              })
          : [],
      };

      // Emit privately — only this specific socket receives it
      io.to(player.socketId).emit('roleAssigned', privatePayload);
      console.log(
        `[roleHandlers] roleAssigned → ${player.name} (${player.socketId}): ${assignments[player.socketId]}`
      );
    }

    // -------------------------------------------------------------------------
    // 5. Mark room as game_active (resets timer + round in DB)
    // -------------------------------------------------------------------------
    await setGameActive(roomId, true);

    // -------------------------------------------------------------------------
    // 6. Broadcast gameStarted to the whole room
    //    Strip role from the payload so no one can read others' roles
    //    from the broadcast message.
    // -------------------------------------------------------------------------
    const safePlayerList = players.map(({ socketId, name, avatar, alive }) => ({
      socketId,
      name,
      avatar,
      alive,
      // role intentionally omitted — delivered privately via roleAssigned
    }));

    io.to(roomId).emit('gameStarted', {
      roomId,
      round:   1,
      players: safePlayerList,
    });

    // -------------------------------------------------------------------------
    // 7. Broadcast initial timerUpdate so clients can start their countdowns
    // -------------------------------------------------------------------------
    io.to(roomId).emit('timerUpdate', { roomId, timer: 180 });

    // -------------------------------------------------------------------------
    // 8. Start the server-authoritative round timer (Module 4)
    // -------------------------------------------------------------------------
    startRoundTimer(roomId, io);

    console.log(
      `[roleHandlers] gameStarted broadcast → room: ${roomId} | ` +
      `players: ${players.length} | impostors: ${impostors.length}`
    );
  } catch (err) {
    console.error(`[roleHandlers] startGame error:`, err.message);
    socket.emit('error', { message: 'Failed to start game. Please try again.' });
  }
}

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

/**
 * registerRoleHandlers
 * Binds game-start event listeners to a socket.
 * Call alongside registerRoomHandlers inside io.on('connection', ...).
 *
 * @param {object} socket
 * @param {object} io
 */
function registerRoleHandlers(socket, io) {
  socket.on('startGame', (data) => handleStartGame(socket, io, data));
  console.log(`[roleHandlers] Handlers registered for socket: ${socket.id}`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  registerRoleHandlers,
  handleStartGame, // exported for unit testing
};
