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

const { generateReport }          = require('./aiService');
const { generateTasksForPlayer }  = require('./taskGenerator');
const { stopRoomTimer, startRoundTimer } = require('./timerHandlers');
const { checkAndResolveIfComplete }      = require('./meetingHandlers');

// Task metadata keyed by taskId — mirrors devhacks-puzzle/src/data/tasks.json
const TASK_META = require('../devhacks-puzzle/src/data/tasks.json')
  .reduce((map, t) => { map[t.id] = { domain: t.domain, language: t.language, prompt: t.prompt }; return map; }, {});

// socketId → topics[] (populated on createRoom / joinRoom)
const playerTopics = new Map();

// ---------------------------------------------------------------------------
// In-memory game session state (task tracking per room)
// ---------------------------------------------------------------------------
// gameSessions  Map<roomId, session>
// session: { taskAssignments, completedTasks, totalTasks, hostSocketId,
//            impostorId, playerAttempts, currentRound, scores }
const gameSessions = new Map();

const TASKS_PER_PLAYER = 2;
const MAX_ROUNDS       = 3;
const POINTS_PER_TASK  = 100;

// ---------------------------------------------------------------------------
// Internal utility
// ---------------------------------------------------------------------------

/**
 * broadcastPlayerList
 * Fetches the current player list from Supabase and broadcasts it to the room.
 *
 * @param {object} io
 * @param {string} roomId
 */
async function broadcastPlayerList(io, roomId) {
  // getPlayers already returns a normalised array from Supabase
  const players = await getPlayers(roomId);

  io.to(roomId).emit('playerListUpdated', { roomId, players });
  console.log(`[roomHandlers] playerListUpdated broadcast → room ${roomId} (${players.length} players)`);
}

// ---------------------------------------------------------------------------
// Session setup — called by roleHandlers after roles are assigned
// ---------------------------------------------------------------------------

/**
 * setupGameSession
 * Initialises an in-memory game session and sends each player their tasks.
 * Call this from roleHandlers.handleStartGame after roles are persisted.
 *
 * @param {string} roomId
 * @param {string} hostSocketId
 * @param {string} impostorId
 * @param {Array}  players      — fresh from getPlayers(roomId)
 * @param {object} io
 */
async function setupGameSession(roomId, hostSocketId, impostorId, players, io) {
  const coders = players.filter(p => p.socketId !== impostorId);
  const assignments = new Map();

  const coderTaskResults = await Promise.all(
    coders.map(p =>
      generateTasksForPlayer(playerTopics.get(p.socketId) || [], p.socketId, TASKS_PER_PLAYER)
    )
  );
  coders.forEach((p, i) => assignments.set(p.socketId, coderTaskResults[i]));

  const impostorTasks = await generateTasksForPlayer(
    playerTopics.get(impostorId) || [], impostorId, TASKS_PER_PLAYER
  );
  assignments.set(impostorId, impostorTasks);

  const totalTasks = coders.length * TASKS_PER_PLAYER;

  gameSessions.set(roomId, {
    taskAssignments: assignments,
    completedTasks:  new Set(),
    totalTasks,
    hostSocketId,
    impostorId,
    playerAttempts:  new Map(),
    currentRound:    1,
    scores:          new Map(players.map(p => [p.socketId, 0])),
  });

  // Deliver each player's tasks separately from the role reveal
  const safePlayerList = players.map(({ socketId, name, avatar, alive }) => ({
    socketId, name, avatar, alive,
  }));

  for (const player of players) {
    const myTasks = assignments.get(player.socketId) || [];
    io.to(player.socketId).emit('tasksAssigned', {
      myTasks,
      totalRoomTasks:     totalTasks,
      roomCompletedTasks: 0,
      roundNumber:        1,
      players:            safePlayerList,
    });
  }

  console.log(
    `[roomHandlers] setupGameSession → room ${roomId} | impostor: ${impostorId} | totalTasks: ${totalTasks}`
  );
}

// ---------------------------------------------------------------------------
// Round-end callback — passed to timerHandlers.startRoundTimer
// Called by timerHandlers when the round timer hits 0
// ---------------------------------------------------------------------------

/**
 * onRoundEndCallback
 * Builds the leaderboard, emits roundEnd, and either ends the game or
 * regenerates tasks and restarts the timer for the next round.
 *
 * @param {string} roomId
 * @param {object} io
 */
async function onRoundEndCallback(roomId, io) {
  const session = gameSessions.get(roomId);
  if (!session) return;

  const { currentRound, scores } = session;
  const players = await getPlayers(roomId);

  const leaderboard = players
    .map(p => ({
      socketId: p.socketId,
      name:     p.name,
      role:     p.socketId === session.impostorId ? 'imposter' : 'coder',
      score:    scores.get(p.socketId) ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  io.to(roomId).emit('roundEnd', { round: currentRound, leaderboard });
  console.log(`[roomHandlers] onRoundEndCallback → room ${roomId} | round ${currentRound}`);

  if (currentRound >= MAX_ROUNDS) {
    io.to(roomId).emit('gameEnd', {
      winner:     'coders',
      leaderboard,
      stats:      { completedTasks: session.completedTasks.size, totalTasks: session.totalTasks },
    });
    gameSessions.delete(roomId);
    return; // Do NOT restart timer — game is over
  }

  // ---- Advance to next round ---------------------------------------------
  const nextRound = currentRound + 1;
  session.currentRound   = nextRound;
  session.completedTasks = new Set();

  const coders = players.filter(p => p.socketId !== session.impostorId);
  const assignments = new Map();

  const coderTaskResults = await Promise.all(
    coders.map(p =>
      generateTasksForPlayer(playerTopics.get(p.socketId) || [], p.socketId, TASKS_PER_PLAYER)
    )
  );
  coders.forEach((p, i) => assignments.set(p.socketId, coderTaskResults[i]));

  const impostorTasks = await generateTasksForPlayer(
    playerTopics.get(session.impostorId) || [], session.impostorId, TASKS_PER_PLAYER
  );
  assignments.set(session.impostorId, impostorTasks);
  session.taskAssignments = assignments;
  session.totalTasks      = coders.length * TASKS_PER_PLAYER;

  // Delay 3 s so players see the leaderboard, then start the next round
  setTimeout(() => {
    if (!gameSessions.get(roomId)) return; // room deleted during delay

    for (const player of players) {
      const myTasks = assignments.get(player.socketId) || [];
      io.to(player.socketId).emit('roundStart', {
        round:   nextRound,
        myTasks,
        scores:  Object.fromEntries(scores),
      });
    }
    // Restart the server-authoritative timer for the next round
    startRoundTimer(roomId, io, undefined, onRoundEndCallback);
    console.log(`[roomHandlers] roundStart → room ${roomId} | round ${nextRound}`);
  }, 3000);
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
  playerTopics.set(socket.id, Array.isArray(topics) ? topics : []);

  // Validate name
  if (!name || typeof name !== 'string' || name.trim() === '') {
    socket.emit('error', { message: 'A player name is required to create a room.' });
    console.warn(`[roomHandlers] createRoom rejected — missing name (socket: ${socket.id})`);
    return;
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
  playerTopics.set(socket.id, Array.isArray(topics) ? topics : []);

  // --- Guard: name -------------------------------------------------------
  if (!name || typeof name !== 'string' || name.trim() === '') {
    socket.emit('error', { message: 'A player name is required to join a room.' });
    console.warn(`[roomHandlers] joinRoom rejected — missing name (socket: ${socket.id})`);
    return;
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

  // socket.rooms contains the socket's own id + any joined room ids
  const joinedRooms = [...socket.rooms].filter((r) => r !== socket.id);

  for (const roomId of joinedRooms) {
    try {
      await removePlayer(roomId, socket.id);

      const empty = await isRoomEmpty(roomId);
      if (empty) {
        stopRoomTimer(roomId);      // cancel countdown (Module 4 — timerHandlers)
        gameSessions.delete(roomId); // clean up task/scoring session
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
 * Binds all room-related event listeners to a single socket.
 * Call this inside the `io.on('connection', ...)` callback.
 */


// ---------------------------------------------------------------------------
// Internal: generate + emit AI reports for all players in a session
// ---------------------------------------------------------------------------

async function triggerAIReports(io, roomId, session) {
  try {
    const players = await getPlayers(roomId);

    for (const player of players) {
      const sid          = player.socketId;
      const attemptsMap  = session.playerAttempts.get(sid) || new Map();
      const attemptsArr  = Array.from(attemptsMap.values());

      const report = await generateReport(player.name, attemptsArr);

      // Send the report only to that specific player's socket
      io.to(sid).emit('aiReport', { reports: { [sid]: report } });
      console.log(`[roomHandlers] aiReport emitted → ${player.name} (${sid})`);
    }
  } catch (err) {
    console.error('[roomHandlers] triggerAIReports error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Event: recordAttempt
// ---------------------------------------------------------------------------

/**
 * handleRecordAttempt
 * Called by the frontend after every submitCode() call (pass OR fail).
 * Payload: { roomId, taskId, passed, userCode }
 */
function handleRecordAttempt(socket, io, data) {
  const { roomId, taskId, passed, userCode } = data;

  const session = gameSessions.get(roomId);
  if (!session) return;

  if (!session.playerAttempts.has(socket.id)) {
    session.playerAttempts.set(socket.id, new Map());
  }

  const playerMap = session.playerAttempts.get(socket.id);
  // Support both static task IDs (TASK_META) and LLM-generated tasks stored in taskAssignments
  let meta = TASK_META[taskId];
  if (!meta) {
    const playerTasks = session.taskAssignments.get(socket.id) || [];
    const found = playerTasks.find((t) => t.id === taskId);
    meta = found
      ? { domain: found.domain, language: found.language, prompt: found.prompt }
      : { domain: 'unknown', language: 'unknown', prompt: taskId };
  }

  if (!playerMap.has(taskId)) {
    playerMap.set(taskId, {
      taskId,
      domain:     meta.domain,
      language:   meta.language,
      prompt:     meta.prompt,
      attempts:   0,
      passed:     false,
      finalCode:  null,
      triedCodes: [],
    });
  }

  const entry    = playerMap.get(taskId);
  entry.attempts++;   // always increment: 1st attempt → 1, 2nd → 2, etc.

  if (passed) {
    entry.passed    = true;
    entry.finalCode = (userCode || '').slice(0, 600);
  } else {
    entry.triedCodes.push((userCode || '').slice(0, 400));
  }

  console.log(`[roomHandlers] recordAttempt ${socket.id} | task: ${taskId} | passed: ${passed} | attempts: ${entry.attempts}`);
}

// ---------------------------------------------------------------------------
// Event: taskComplete
// ---------------------------------------------------------------------------

/**
 * handleTaskComplete
 * Expected payload: { roomId, taskId }
 * Marks a task as done for this player, checks win condition, broadcasts updates.
 */
async function handleTaskComplete(socket, io, data) {
  const { roomId, taskId } = data;

  try {
    const session = gameSessions.get(roomId);
    if (!session) {
      socket.emit('error', { message: 'No active game session found.' });
      return;
    }

    const key = `${socket.id}:${taskId}`;
    if (session.completedTasks.has(key)) return; // already counted

    session.completedTasks.add(key);
    const roomCompleted = session.completedTasks.size;

    // Award points to the solver
    const prevScore = session.scores.get(socket.id) ?? 0;
    const newScore  = prevScore + POINTS_PER_TASK;
    session.scores.set(socket.id, newScore);

    // Broadcast score update to the room
    io.to(roomId).emit('scoreUpdate', {
      playerId: socket.id,
      score:    newScore,
      delta:    POINTS_PER_TASK,
      scores:   Object.fromEntries(session.scores),
    });

    // Notify everyone of progress
    io.to(roomId).emit('taskCompleted', {
      playerId:           socket.id,
      taskId,
      roomCompletedTasks: roomCompleted,
      totalRoomTasks:     session.totalTasks,
    });

    // Update activity log
    const players = await getPlayers(roomId);
    const player  = players.find((p) => p.socketId === socket.id);
    const name    = player ? player.name : 'Someone';
    io.to(roomId).emit('activityUpdate', {
      message: `${name} completed a task`,
    });

    // --- Check coders win condition ----------------------------------------
    if (roomCompleted >= session.totalTasks) {
      stopRoomTimer(roomId);
      const allPlayers = await getPlayers(roomId);
      const leaderboard = allPlayers.map(p => ({
        socketId: p.socketId,
        name:     p.name,
        role:     p.socketId === session.impostorId ? 'imposter' : 'coder',
        score:    session.scores.get(p.socketId) ?? 0,
      })).sort((a, b) => b.score - a.score);

      io.to(roomId).emit('gameEnd', {
        winner:     'coders',
        leaderboard,
        stats:      { completedTasks: roomCompleted, totalTasks: session.totalTasks },
      });
      console.log(`[roomHandlers] coders win → room ${roomId}`);

      // Generate AI reports asynchronously — don't block game end
      triggerAIReports(io, roomId, session).then(() => {
        gameSessions.delete(roomId);
      });
    }

    await broadcastPlayerList(io, roomId);
  } catch (err) {
    console.error('[roomHandlers] taskComplete error:', err.message);
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
  socket.on('createRoom',    (data) => handleCreateRoom(socket, io, data));
  socket.on('joinRoom',      (data) => handleJoinRoom(socket, io, data));
  socket.on('taskComplete',  (data) => handleTaskComplete(socket, io, data));
  socket.on('recordAttempt', (data) => handleRecordAttempt(socket, io, data));
  socket.on('disconnect',    ()     => handleDisconnect(socket, io));

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
  handleTaskComplete,
  handleRecordAttempt,
  broadcastPlayerList,
  setupGameSession,
  onRoundEndCallback,
};
