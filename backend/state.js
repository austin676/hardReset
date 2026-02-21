/**
 * state.js
 * --------
 * Persistent room/player state backed by Supabase (PostgreSQL).
 * All functions are async — always await them in roomHandlers.js.
 *
 * Database tables  (see schema.sql):
 *   rooms   — one row per room
 *   players — one row per connected player, FK → rooms.room_id
 */

const { supabase } = require('./supabase');

// ---------------------------------------------------------------------------
// Room code generator
// ---------------------------------------------------------------------------

/**
 * generateRoomCode
 * Generates a unique 6-character alphanumeric room code.
 * Queries Supabase to guarantee no collision with existing rooms.
 *
 * @returns {Promise<string>}
 */
async function generateRoomCode() {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  let code;
  let exists = true;

  while (exists) {
    code = Array.from({ length: 6 }, () =>
      CHARS[Math.floor(Math.random() * CHARS.length)]
    ).join('');

    // Check DB — if no row found, the code is free to use
    const { data } = await supabase
      .from('rooms')
      .select('room_id')
      .eq('room_id', code)
      .maybeSingle();

    exists = !!data;
  }

  return code;
}

// ---------------------------------------------------------------------------
// Room lifecycle
// ---------------------------------------------------------------------------

/**
 * createRoom
 * Inserts a new room row into Supabase.
 *
 * @param {string} roomId
 */
async function createRoom(roomId) {
  const { error } = await supabase.from('rooms').insert({
    room_id:           roomId,
    meeting_active:    false,
    timer:             180,
    sabotage_stations: {},
    round:             1,
  });

  if (error) throw new Error(`[state] createRoom failed: ${error.message}`);
  console.log(`[state] Room created in DB: ${roomId}`);
}

/**
 * deleteRoom
 * Deletes a room row. Players are removed automatically via ON DELETE CASCADE.
 *
 * @param {string} roomId
 */
async function deleteRoom(roomId) {
  const { error } = await supabase
    .from('rooms')
    .delete()
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] deleteRoom failed: ${error.message}`);
  console.log(`[state] Room deleted from DB: ${roomId}`);
}

/**
 * roomExists
 * Returns true if a room row exists in Supabase.
 *
 * @param {string} roomId
 * @returns {Promise<boolean>}
 */
async function roomExists(roomId) {
  const { data } = await supabase
    .from('rooms')
    .select('room_id')
    .eq('room_id', roomId)
    .maybeSingle();

  return !!data;
}

/**
 * getRoom
 * Returns the full room row or null.
 *
 * @param {string} roomId
 * @returns {Promise<object|null>}
 */
async function getRoom(roomId) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('room_id', roomId)
    .maybeSingle();

  if (error) throw new Error(`[state] getRoom failed: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Player helpers
// ---------------------------------------------------------------------------

/**
 * addPlayer
 * Upserts a player row into Supabase.
 * Upsert handles the case where the same socket reconnects mid-game.
 *
 * @param {string} roomId
 * @param {string} socketId
 * @param {string} name
 * @param {string} avatar
 */
async function addPlayer(roomId, socketId, name, avatar) {
  const { error } = await supabase.from('players').upsert({
    socket_id:       socketId,
    room_id:         roomId,
    name,
    avatar:          avatar || 'default',
    role:            null,
    position_x:      0,
    position_y:      0,
    alive:           true,
    tasks_completed: 0,
    sabotage_points: 0,
    vote:            null,
  });

  if (error) throw new Error(`[state] addPlayer failed: ${error.message}`);
  console.log(`[state] Player added to DB — room: ${roomId}, name: ${name} (${socketId})`);
}

/**
 * removePlayer
 * Deletes a player row from Supabase.
 *
 * @param {string} roomId   - Kept for symmetry and logging; cascade handles DB.
 * @param {string} socketId
 */
async function removePlayer(roomId, socketId) {
  const { error } = await supabase
    .from('players')
    .delete()
    .eq('socket_id', socketId);

  if (error) throw new Error(`[state] removePlayer failed: ${error.message}`);
  console.log(`[state] Player removed from DB: ${socketId} (room: ${roomId})`);
}

/**
 * getPlayers
 * Returns all players in a room as an array, shaped to match the original API.
 *
 * Returned objects look like:
 *   { socketId, name, avatar, role, position: {x, y}, alive,
 *     tasksCompleted, sabotagePoints, vote }
 *
 * @param {string} roomId
 * @returns {Promise<object[]>}
 */
async function getPlayers(roomId) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] getPlayers failed: ${error.message}`);

  // Normalise DB column names → camelCase shape expected by handlers/clients
  return (data || []).map((p) => ({
    socketId:        p.socket_id,
    name:            p.name,
    avatar:          p.avatar,
    role:            p.role,
    position:        { x: p.position_x, y: p.position_y },
    alive:           p.alive,
    tasksCompleted:  p.tasks_completed,
    sabotagePoints:  p.sabotage_points,
    vote:            p.vote,
  }));
}

/**
 * isRoomEmpty
 * Returns true if no players are currently in the room.
 *
 * @param {string} roomId
 * @returns {Promise<boolean>}
 */
async function isRoomEmpty(roomId) {
  const { count, error } = await supabase
    .from('players')
    .select('socket_id', { count: 'exact', head: true })
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] isRoomEmpty failed: ${error.message}`);
  return count === 0;
}

/**
 * playerExistsInRoom
 * Returns true if a socket is already registered in a room.
 * Used to prevent duplicate joins.
 *
 * @param {string} roomId
 * @param {string} socketId
 * @returns {Promise<boolean>}
 */
async function playerExistsInRoom(roomId, socketId) {
  const { data } = await supabase
    .from('players')
    .select('socket_id')
    .eq('room_id', roomId)
    .eq('socket_id', socketId)
    .maybeSingle();

  return !!data;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  generateRoomCode,
  createRoom,
  deleteRoom,
  roomExists,
  getRoom,
  addPlayer,
  removePlayer,
  getPlayers,
  isRoomEmpty,
  playerExistsInRoom,
};
