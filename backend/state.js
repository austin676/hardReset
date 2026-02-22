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
    timeoutUntil:    p.timeout_until ?? null,
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
// Game lifecycle helpers (Module 2)
// ---------------------------------------------------------------------------

/**
 * isGameStarted
 * Returns true if the room's game_active flag is set.
 * Used to prevent duplicate startGame calls.
 *
 * @param {string} roomId
 * @returns {Promise<boolean>}
 */
async function isGameStarted(roomId) {
  const { data } = await supabase
    .from('rooms')
    .select('game_active')
    .eq('room_id', roomId)
    .maybeSingle();

  return data?.game_active === true;
}

/**
 * setGameActive
 * Flips the game_active flag and resets the round timer on the room row.
 *
 * @param {string} roomId
 * @param {boolean} active
 */
async function setGameActive(roomId, active) {
  const { error } = await supabase
    .from('rooms')
    .update({ game_active: active, timer: 180, round: 1 })
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] setGameActive failed: ${error.message}`);
  console.log(`[state] Room ${roomId} game_active → ${active}`);
}

/**
 * resetPlayersForGame
 * Resets all players in a room to a fresh in-game state:
 *   alive=true, tasksCompleted=0, sabotagePoints=0, vote=null, role=null
 * Called before roles are (re-)assigned.
 *
 * @param {string} roomId
 */
async function resetPlayersForGame(roomId) {
  const { error } = await supabase
    .from('players')
    .update({
      alive:           true,
      tasks_completed: 0,
      sabotage_points: 0,
      vote:            null,
      role:            null,
      timeout_until:   null,
    })
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] resetPlayersForGame failed: ${error.message}`);
  console.log(`[state] Players reset for game in room: ${roomId}`);
}

/**
 * updatePlayerRole
 * Persists the role assigned to a single player.
 *
 * @param {string} socketId
 * @param {string} role  — 'crewmate' | 'impostor'
 */
async function updatePlayerRole(socketId, role) {
  const { error } = await supabase
    .from('players')
    .update({ role })
    .eq('socket_id', socketId);

  if (error) throw new Error(`[state] updatePlayerRole failed: ${error.message}`);
}

/**
 * getPlayerSocketIds
 * Returns a plain array of socket_id strings for a room.
 * Lightweight — used by role assignment which only needs the ids.
 *
 * @param {string} roomId
 * @returns {Promise<string[]>}
 */
async function getPlayerSocketIds(roomId) {
  const { data, error } = await supabase
    .from('players')
    .select('socket_id')
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] getPlayerSocketIds failed: ${error.message}`);
  return (data || []).map((p) => p.socket_id);
}

// ---------------------------------------------------------------------------
// Movement helpers (Module 3)
// ---------------------------------------------------------------------------

/**
 * updatePlayerPosition
 * Updates position_x and position_y for a single player in Supabase.
 * Called on every validated playerMove event.
 *
 * @param {string} roomId   - Used for logging only; FK ensures integrity.
 * @param {string} socketId
 * @param {number} x
 * @param {number} y
 */
async function updatePlayerPosition(roomId, socketId, x, y) {
  const { error } = await supabase
    .from('players')
    .update({ position_x: x, position_y: y })
    .eq('socket_id', socketId);

  if (error) throw new Error(`[state] updatePlayerPosition failed: ${error.message}`);
}

/**
 * getPlayerState
 * Returns a single player's row as a normalised object, or null.
 * Used by movement handler to check alive / meeting guard.
 *
 * @param {string} socketId
 * @returns {Promise<object|null>}
 */
async function getPlayerState(socketId) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('socket_id', socketId)
    .maybeSingle();

  if (error) throw new Error(`[state] getPlayerState failed: ${error.message}`);
  if (!data) return null;

  return {
    socketId:       data.socket_id,
    roomId:         data.room_id,
    name:           data.name,
    avatar:         data.avatar,
    role:           data.role,
    position:       { x: data.position_x, y: data.position_y },
    alive:          data.alive,
    tasksCompleted: data.tasks_completed,
    sabotagePoints: data.sabotage_points,
    vote:           data.vote,
    timeoutUntil:   data.timeout_until ?? null,
  };
}

// ---------------------------------------------------------------------------
// Timer helpers (Module 4)
// ---------------------------------------------------------------------------

/**
 * setRoomTimer
 * Persists the current countdown value for a room.
 * Called once per second by timerHandlers.
 *
 * @param {string} roomId
 * @param {number} timer  — seconds remaining
 */
async function setRoomTimer(roomId, timer) {
  const { error } = await supabase
    .from('rooms')
    .update({ timer })
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] setRoomTimer failed: ${error.message}`);
}

/**
 * incrementRound
 * Bumps the round counter and resets the timer column to 180 for the next round.
 *
 * @param {string} roomId
 */
async function incrementRound(roomId) {
  // Supabase does not support server-side arithmetic in a simple update,
  // so we read the current value first then write back.
  const { data, error: readErr } = await supabase
    .from('rooms')
    .select('round')
    .eq('room_id', roomId)
    .maybeSingle();

  if (readErr) throw new Error(`[state] incrementRound read failed: ${readErr.message}`);

  const nextRound = (data?.round ?? 0) + 1;

  const { error } = await supabase
    .from('rooms')
    .update({ round: nextRound, timer: 180 })
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] incrementRound write failed: ${error.message}`);
  console.log(`[state] Room ${roomId} advanced to round ${nextRound}`);
}

/**
 * setPlayerTimeout
 * Records a timeout_until timestamp for a player, blocking movement until that
 * time passes. Pass an ISO string (use buildTimeoutUntil from timerUtils).
 *
 * @param {string} socketId
 * @param {string} timeoutUntil  — ISO 8601 timestamp
 */
async function setPlayerTimeout(socketId, timeoutUntil) {
  const { error } = await supabase
    .from('players')
    .update({ timeout_until: timeoutUntil })
    .eq('socket_id', socketId);

  if (error) throw new Error(`[state] setPlayerTimeout failed: ${error.message}`);
}

/**
 * clearPlayerTimeout
 * Removes an active timeout from a player (sets timeout_until back to null).
 *
 * @param {string} socketId
 */
async function clearPlayerTimeout(socketId) {
  const { error } = await supabase
    .from('players')
    .update({ timeout_until: null })
    .eq('socket_id', socketId);

  if (error) throw new Error(`[state] clearPlayerTimeout failed: ${error.message}`);
}

/**
 * isMeetingActive
 * Returns the meetingActive flag for a room.
 * Movement is blocked during meetings.
 *
 * @param {string} roomId
 * @returns {Promise<boolean>}
 */
async function isMeetingActive(roomId) {
  const { data } = await supabase
    .from('rooms')
    .select('meeting_active')
    .eq('room_id', roomId)
    .maybeSingle();

  return data?.meeting_active === true;
}

// ---------------------------------------------------------------------------
// Meeting helpers (Module 5)
// ---------------------------------------------------------------------------

/**
 * setMeetingActive
 * Flips the meeting_active flag on a room row.
 * Passing true pauses gameplay (movement module already checks this flag).
 *
 * @param {string} roomId
 * @param {boolean} active
 */
async function setMeetingActive(roomId, active) {
  const { error } = await supabase
    .from('rooms')
    .update({ meeting_active: active })
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] setMeetingActive failed: ${error.message}`);
  console.log(`[state] Room ${roomId} meeting_active → ${active}`);
}

/**
 * castVote
 * Persists a single player’s vote choice.
 * targetId is either a socketId or the string 'skip'.
 *
 * @param {string} socketId
 * @param {string} targetId
 */
async function castVote(socketId, targetId) {
  const { error } = await supabase
    .from('players')
    .update({ vote: targetId })
    .eq('socket_id', socketId);

  if (error) throw new Error(`[state] castVote failed: ${error.message}`);
}

/**
 * resetAllVotes
 * Sets vote = null for every player in a room.
 * Called at the start and end of each meeting.
 *
 * @param {string} roomId
 */
async function resetAllVotes(roomId) {
  const { error } = await supabase
    .from('players')
    .update({ vote: null })
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] resetAllVotes failed: ${error.message}`);
  console.log(`[state] Votes reset for room: ${roomId}`);
}

/**
 * setPlayerAlive
 * Updates a player’s alive status (false = ejected / killed).
 *
 * @param {string} socketId
 * @param {boolean} alive
 */
async function setPlayerAlive(socketId, alive) {
  const { error } = await supabase
    .from('players')
    .update({ alive })
    .eq('socket_id', socketId);

  if (error) throw new Error(`[state] setPlayerAlive failed: ${error.message}`);
  console.log(`[state] Player ${socketId} alive → ${alive}`);
}
// ---------------------------------------------------------------------------
// Task & Sabotage helpers (Module 6)
// ---------------------------------------------------------------------------

/**
 * getSabotageStations
 * Returns the full sabotage_stations JSONB object for a room.
 * Shape: { [stationId]: { sabotaged, by, expiresAt } }
 *
 * @param {string} roomId
 * @returns {Promise<Record<string, object>>}
 */
async function getSabotageStations(roomId) {
  const { data, error } = await supabase
    .from('rooms')
    .select('sabotage_stations')
    .eq('room_id', roomId)
    .maybeSingle();

  if (error) throw new Error(`[state] getSabotageStations failed: ${error.message}`);
  return data?.sabotage_stations ?? {};
}

/**
 * setSabotageStations
 * Overwrites the sabotage_stations JSONB column for a room.
 * Pass the entire updated map (use sabotageUtils helpers to build/clean it).
 *
 * @param {string} roomId
 * @param {Record<string, object>} stations
 */
async function setSabotageStations(roomId, stations) {
  const { error } = await supabase
    .from('rooms')
    .update({ sabotage_stations: stations })
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] setSabotageStations failed: ${error.message}`);
}

/**
 * incrementTasksCompleted
 * Adds 1 to a player's tasks_completed counter.
 *
 * @param {string} socketId
 */
async function incrementTasksCompleted(socketId) {
  const { data, error: readErr } = await supabase
    .from('players')
    .select('tasks_completed')
    .eq('socket_id', socketId)
    .maybeSingle();

  if (readErr) throw new Error(`[state] incrementTasksCompleted read failed: ${readErr.message}`);

  const next = (data?.tasks_completed ?? 0) + 1;
  const { error } = await supabase
    .from('players')
    .update({ tasks_completed: next })
    .eq('socket_id', socketId);

  if (error) throw new Error(`[state] incrementTasksCompleted write failed: ${error.message}`);
}

/**
 * awardSabotagePoints
 * Adds `delta` to a player's sabotage_points (use negative delta to deduct).
 *
 * @param {string} socketId
 * @param {number} delta  — positive to award, negative to spend
 */
async function awardSabotagePoints(socketId, delta) {
  const { data, error: readErr } = await supabase
    .from('players')
    .select('sabotage_points')
    .eq('socket_id', socketId)
    .maybeSingle();

  if (readErr) throw new Error(`[state] awardSabotagePoints read failed: ${readErr.message}`);

  const next = Math.max(0, (data?.sabotage_points ?? 0) + delta);
  const { error } = await supabase
    .from('players')
    .update({ sabotage_points: next })
    .eq('socket_id', socketId);

  if (error) throw new Error(`[state] awardSabotagePoints write failed: ${error.message}`);
}

/**
 * incrementRoomTaskProgress
 * Adds 1 to the room-level task_progress counter.
 * Called only for crewmate task completions.
 *
 * @param {string} roomId
 */
async function incrementRoomTaskProgress(roomId) {
  const { data, error: readErr } = await supabase
    .from('rooms')
    .select('task_progress')
    .eq('room_id', roomId)
    .maybeSingle();

  if (readErr) throw new Error(`[state] incrementRoomTaskProgress read failed: ${readErr.message}`);

  const next = (data?.task_progress ?? 0) + 1;
  const { error } = await supabase
    .from('rooms')
    .update({ task_progress: next })
    .eq('room_id', roomId);

  if (error) throw new Error(`[state] incrementRoomTaskProgress write failed: ${error.message}`);
}

/**
 * getRoomTaskProgress
 * Returns the current room-wide task_progress counter.
 *
 * @param {string} roomId
 * @returns {Promise<number>}
 */
async function getRoomTaskProgress(roomId) {
  const { data, error } = await supabase
    .from('rooms')
    .select('task_progress')
    .eq('room_id', roomId)
    .maybeSingle();

  if (error) throw new Error(`[state] getRoomTaskProgress failed: ${error.message}`);
  return data?.task_progress ?? 0;
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
  // Module 2 — game lifecycle
  isGameStarted,
  setGameActive,
  resetPlayersForGame,
  updatePlayerRole,
  getPlayerSocketIds,
  // Module 3 — movement
  updatePlayerPosition,
  getPlayerState,
  isMeetingActive,
  // Module 4 — timer & timeout
  setRoomTimer,
  incrementRound,
  setPlayerTimeout,
  clearPlayerTimeout,
  // Module 5 — meeting & voting
  setMeetingActive,
  castVote,
  resetAllVotes,
  setPlayerAlive,  // Module 6 \u2014 task progress & sabotage
  getSabotageStations,
  setSabotageStations,
  incrementTasksCompleted,
  awardSabotagePoints,
  incrementRoomTaskProgress,
  getRoomTaskProgress,};
