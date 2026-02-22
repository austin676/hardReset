/**
 * roomHandlers.js
 * ---------------
 * Registers all Socket.io event handlers related to room lifecycle:
 *   - createRoom  → host creates a new lobby
 *   - joinRoom    → player enters an existing lobby
 *   - disconnect  → cleanup when a socket drops
 *
 * All state functions are now async (Supabase-backed), so every handler
 * is an async function and errors are caught and emitted to the client.
 */

const {
  generateRoomCode,
  createRoom,
  deleteRoom,
  roomExists,
  addPlayer,
  removePlayer,
  getPlayers,
  isRoomEmpty,
  playerExistsInRoom,
} = require('./state');

const { stopRoomTimer }             = require('./timerHandlers');
const { checkAndResolveIfComplete } = require('./meetingHandlers');
const { stopSabotageChecker, clearRoomScores } = require('./taskHandlers');
const { setPlayerTopics, deletePlayerTopics } = require('./playerTopics');

// ---------------------------------------------------------------------------
// Internal utility
// ---------------------------------------------------------------------------

/**
 * broadcastPlayerList
 * Fetches the current player list from Supabase and broadcasts it to the room.
 */
async function broadcastPlayerList(io, roomId) {
  const players = await getPlayers(roomId);
  io.to(roomId).emit('playerListUpdated', { roomId, players });
  console.log(`[roomHandlers] playerListUpdated → room ${roomId} (${players.length} players)`);
}

// ---------------------------------------------------------------------------
// Event: createRoom
// ---------------------------------------------------------------------------

/**
 * handleCreateRoom
 * Expected payload: { name: string, avatar: string }
 * Emits:  roomCreated → { roomId, players }
 */
async function handleCreateRoom(socket, io, data) {
  const { name, avatar, topics } = data;

  // Validate name
  if (!name || typeof name !== 'string' || name.trim() === '') {
    socket.emit('error', { message: 'A player name is required to create a room.' });
    console.warn(`[roomHandlers] createRoom rejected — missing name (socket: ${socket.id})`);
    return;
  }

  // Store topics in memory
  if (Array.isArray(topics) && topics.length > 0) {
    setPlayerTopics(socket.id, topics);
  }

  try {
    // Generate a unique code (async — checks DB for collisions)
    const roomId = await generateRoomCode();

    // Persist room and host player to Supabase
    await createRoom(roomId);
    await addPlayer(roomId, socket.id, name.trim(), avatar || 'default');

    // Subscribe socket to the room channel
    socket.join(roomId);

    // Fetch the persisted player list to confirm
    const players = await getPlayers(roomId);

    socket.emit('roomCreated', { roomId, players });
    console.log(`[roomHandlers] roomCreated → ${roomId} | host: ${name} (${socket.id})`);
  } catch (err) {
    console.error(`[roomHandlers] createRoom error:`, err.message);
    socket.emit('error', { message: 'Failed to create room. Please try again.' });
  }
}

// ---------------------------------------------------------------------------
// Event: joinRoom
// ---------------------------------------------------------------------------

/**
 * handleJoinRoom
 * Expected payload: { roomId: string, name: string, avatar: string }
 * Emits to joiner:      roomJoined        → { roomId, players }
 * Broadcasts to room:   playerListUpdated → { roomId, players }
 */
async function handleJoinRoom(socket, io, data) {
  const { roomId, name, avatar, topics } = data;

  // --- Guard: name -------------------------------------------------------
  if (!name || typeof name !== 'string' || name.trim() === '') {
    socket.emit('error', { message: 'A player name is required to join a room.' });
    console.warn(`[roomHandlers] joinRoom rejected — missing name (socket: ${socket.id})`);
    return;
  }

  // Store topics in memory
  if (Array.isArray(topics) && topics.length > 0) {
    setPlayerTopics(socket.id, topics);
  }

  try {
    // --- Guard: room must exist -------------------------------------------
    const exists = await roomExists(roomId);
    if (!roomId || !exists) {
      socket.emit('error', { message: `Room "${roomId}" does not exist.` });
      console.warn(`[roomHandlers] joinRoom rejected — room not found: ${roomId} (socket: ${socket.id})`);
      return;
    }

    // --- Guard: prevent duplicate joins -----------------------------------
    const alreadyIn = await playerExistsInRoom(roomId, socket.id);
    if (alreadyIn) {
      socket.emit('error', { message: 'You are already in this room.' });
      console.warn(`[roomHandlers] joinRoom rejected — duplicate join (socket: ${socket.id}, room: ${roomId})`);
      return;
    }

    // Persist player to Supabase
    await addPlayer(roomId, socket.id, name.trim(), avatar || 'default');

    // Subscribe socket to room channel
    socket.join(roomId);

    // Fetch updated list
    const players = await getPlayers(roomId);

    // Confirm to the new player
    socket.emit('roomJoined', { roomId, players });
    console.log(`[roomHandlers] roomJoined → ${roomId} | player: ${name} (${socket.id})`);

    // Broadcast updated roster to everyone in the room
    await broadcastPlayerList(io, roomId);
  } catch (err) {
    console.error(`[roomHandlers] joinRoom error:`, err.message);
    socket.emit('error', { message: 'Failed to join room. Please try again.' });
  }
}

// ---------------------------------------------------------------------------
// Event: disconnect
// ---------------------------------------------------------------------------

/**
 * handleDisconnect
 * Removes the player from Supabase and cleans up empty rooms.
 */
async function handleDisconnect(socket, io) {
  console.log(`[roomHandlers] disconnect — socket: ${socket.id}`);

  // Clean up ephemeral topic preference
  deletePlayerTopics(socket.id);

  // socket.rooms contains the socket's own id + any joined room ids
  const joinedRooms = [...socket.rooms].filter((r) => r !== socket.id);

  for (const roomId of joinedRooms) {
    try {
      await removePlayer(roomId, socket.id);

      const empty = await isRoomEmpty(roomId);
      if (empty) {
        stopRoomTimer(roomId);          // cancel round countdown (Module 4)
        stopSabotageChecker(roomId);    // cancel sabotage expiry checker (Module 6)
        clearRoomScores(roomId);        // clear in-memory score cache
        await deleteRoom(roomId);
        console.log(`[roomHandlers] Room ${roomId} deleted — no players remaining`);
      } else {
        // Tell remaining players this socket left (movement updates should stop)
        io.to(roomId).emit('playerLeft', { socketId: socket.id, roomId });
        await broadcastPlayerList(io, roomId);

        // If a meeting is in progress and this player was the last unvoted voter,
        // auto-resolve so the meeting doesn't stall indefinitely.
        await checkAndResolveIfComplete(roomId, io);
      }
    } catch (err) {
      console.error(`[roomHandlers] disconnect cleanup error for room ${roomId}:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

/**
 * registerRoomHandlers
 * Binds room lifecycle event listeners to a socket.
 * NOTE: startGame is handled by registerRoleHandlers (roleHandlers.js).
 */
function registerRoomHandlers(socket, io) {
  socket.on('createRoom', (data) => handleCreateRoom(socket, io, data));
  socket.on('joinRoom',   (data) => handleJoinRoom(socket, io, data));
  socket.on('disconnect', ()     => handleDisconnect(socket, io));

  console.log(`[roomHandlers] Handlers registered for socket: ${socket.id}`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  registerRoomHandlers,
  handleCreateRoom,
  handleJoinRoom,
  handleDisconnect,
  broadcastPlayerList,
};
