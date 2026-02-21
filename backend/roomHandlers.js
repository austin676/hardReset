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

const { generateReport } = require('./aiService');
const { generateTasksForPlayer } = require('./taskGenerator');

// Task metadata keyed by taskId — mirrors devhacks-puzzle/src/data/tasks.json
// Update this when new tasks are added to the puzzle engine.
const TASK_META = require('../devhacks-puzzle/src/data/tasks.json')
  .reduce((map, t) => { map[t.id] = { domain: t.domain, language: t.language, prompt: t.prompt }; return map; }, {});

// Module-level map: socketId → topics[]  (populated on createRoom / joinRoom)
const playerTopics = new Map();

// ---------------------------------------------------------------------------
// In-memory game session state (task tracking per room)
// ---------------------------------------------------------------------------

/**
 * gameSessions  Map<roomId, session>
 *
 * session shape:
 *   taskAssignments : Map<socketId, string[]>              — assigned task IDs per player
 *   completedTasks  : Set<string>                          — "socketId:taskId" dedupe keys
 *   totalTasks      : number
 *   hostSocketId    : string
 *   impostorId      : string
 *   playerAttempts  : Map<socketId, Map<taskId, AttemptData>>
 *
 * AttemptData shape:
 *   { domain, language, prompt, attempts, passed, finalCode, triedCodes }
 */
const gameSessions = new Map();

// Per-room round timer intervals  Map<roomId, NodeJS.Timeout>
const roomTimers = new Map();

// All task IDs available in the puzzle engine (from tasks.json)
const ALL_TASK_IDS = [
  'python_oops_1',
  'python_oops_2',
  'python_dsa_1',
  'python_dsa_2',
  'js_basic_1',
  'js_basic_2',
];

const TASKS_PER_PLAYER = 2;
const ROUND_DURATION   = 180;  // 3 minutes per round
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
// Round timer helpers
// ---------------------------------------------------------------------------

function stopRoundTimer(roomId) {
  const existing = roomTimers.get(roomId);
  if (existing) {
    clearInterval(existing);
    roomTimers.delete(roomId);
  }
}

async function handleRoundEnd(io, roomId) {
  stopRoundTimer(roomId);

  const session = gameSessions.get(roomId);
  if (!session) return;

  const { currentRound, scores } = session;

  // Build leaderboard from current scores
  const players = await getPlayers(roomId);
  const leaderboard = players.map(p => ({
    socketId: p.socketId,
    name:     p.name,
    role:     p.socketId === session.impostorId ? 'imposter' : 'coder',
    score:    scores.get(p.socketId) ?? 0,
  })).sort((a, b) => b.score - a.score);

  io.to(roomId).emit('roundEnd', { round: currentRound, leaderboard });
  console.log(`[roomHandlers] roundEnd → room ${roomId} | round ${currentRound}`);

  if (currentRound >= MAX_ROUNDS) {
    // Final round — game over
    const winner = 'coders'; // coders win if they finish all rounds
    io.to(roomId).emit('gameEnd', {
      winner,
      leaderboard,
      stats: { completedTasks: session.completedTasks.size, totalTasks: session.totalTasks },
    });
    gameSessions.delete(roomId);
    return;
  }

  // ---- Advance to next round ------------------------------------------------
  const nextRound = currentRound + 1;
  session.currentRound  = nextRound;
  session.completedTasks = new Set();

  // Regenerate tasks for every player
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
  session.totalTasks = coders.length * TASKS_PER_PLAYER;

  // Notify each player of the new round + their new tasks
  for (const player of players) {
    const myTasks = assignments.get(player.socketId) || [];
    io.to(player.socketId).emit('roundStart', {
      round:   nextRound,
      myTasks,
      scores:  Object.fromEntries(scores),
    });
  }

  // Give players 3 seconds to see the leaderboard, then start the timer
  setTimeout(() => {
    startRoundTimer(io, roomId);
  }, 3000);

  console.log(`[roomHandlers] roundStart → room ${roomId} | round ${nextRound}`);
}

function startRoundTimer(io, roomId) {
  stopRoundTimer(roomId);          // safety: clear any existing

  const session = gameSessions.get(roomId);
  if (!session) return;

  session.timerLeft = ROUND_DURATION;

  const interval = setInterval(async () => {
    const s = gameSessions.get(roomId);
    if (!s) { clearInterval(interval); roomTimers.delete(roomId); return; }

    s.timerLeft -= 1;
    io.to(roomId).emit('timerUpdate', { timeLeft: s.timerLeft, round: s.currentRound });

    if (s.timerLeft <= 0) {
      await handleRoundEnd(io, roomId);
    }
  }, 1000);

  roomTimers.set(roomId, interval);
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
        stopRoundTimer(roomId);
        gameSessions.delete(roomId);
        await deleteRoom(roomId);
        console.log(`[roomHandlers] Room ${roomId} deleted — no players remaining`);
      } else {
        // Tell remaining players this socket left (movement updates should stop)
        io.to(roomId).emit('playerLeft', { socketId: socket.id, roomId });
        await broadcastPlayerList(io, roomId);
      }
    } catch (err) {
      console.error(`[roomHandlers] disconnect cleanup error for room ${roomId}:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Event: startGame
// ---------------------------------------------------------------------------

/**
 * handleStartGame
 * Expected payload: { roomId }
 * Assigns roles + tasks, starts round 1, and broadcasts gameStarted to the room.
 */
async function handleStartGame(socket, io, data) {
  const { roomId } = data;

  try {
    const players = await getPlayers(roomId);
    if (!players || players.length < 2) {
      socket.emit('error', { message: 'Need at least 2 players to start.' });
      return;
    }

    // --- Assign impostor (random player) -----------------------------------
    const impostorIdx  = Math.floor(Math.random() * players.length);
    const impostorId   = players[impostorIdx].socketId;

    // --- Generate personalised tasks for every player via LLM ---------------
    const coders       = players.filter((p) => p.socketId !== impostorId);
    const assignments  = new Map();   // socketId → Task[]

    // Generate for coders in parallel
    const coderTaskResults = await Promise.all(
      coders.map((p) =>
        generateTasksForPlayer(playerTopics.get(p.socketId) || [], p.socketId, TASKS_PER_PLAYER)
      )
    );
    coders.forEach((p, i) => assignments.set(p.socketId, coderTaskResults[i]));

    // Impostor gets their own generated tasks too (they just don't need to finish)
    const impostorTasks = await generateTasksForPlayer(
      playerTopics.get(impostorId) || [], impostorId, TASKS_PER_PLAYER
    );
    assignments.set(impostorId, impostorTasks);

    const totalTasks = coders.length * TASKS_PER_PLAYER;

    // --- Persist session state in memory -----------------------------------
    gameSessions.set(roomId, {
      taskAssignments:  assignments,
      completedTasks:   new Set(),
      totalTasks,
      hostSocketId:     socket.id,
      impostorId,
      playerAttempts:   new Map(),   // socketId → Map<taskId, AttemptData>
      currentRound:     1,
      timerLeft:        ROUND_DURATION,
      scores:           new Map(players.map(p => [p.socketId, 0])),
    });

    // --- Broadcast to each player individually (sends their own tasks) -----
    // Safe player list (no roles revealed cross-player)
    const safePlayerList = players.map(({ socketId, name, avatar, alive }) => ({
      socketId, name, avatar, alive,
    }));

    for (const player of players) {
      const role    = player.socketId === impostorId ? 'imposter' : 'coder';
      const myTasks = assignments.get(player.socketId) || [];

      io.to(player.socketId).emit('gameStarted', {
        role,
        myTasks,
        totalRoomTasks:     totalTasks,
        roomCompletedTasks: 0,
        roundNumber:        1,
        players:            safePlayerList,   // ← full lobby for Phaser spawning
      });
    }

    console.log(`[roomHandlers] gameStarted → room ${roomId} | impostor: ${impostorId} | totalTasks: ${totalTasks}`);

    // Start round 1 timer (slight delay so clients can render the game)
    setTimeout(() => startRoundTimer(io, roomId), 2000);
  } catch (err) {
    console.error('[roomHandlers] startGame error:', err.message);
    socket.emit('error', { message: 'Failed to start game.' });
  }
}

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
      stopRoundTimer(roomId);
      const players = await getPlayers(roomId);
      const leaderboard = players.map(p => ({
        socketId: p.socketId,
        name:     p.name,
        role:     p.socketId === session.impostorId ? 'imposter' : 'coder',
        score:    session.scores.get(p.socketId) ?? 0,
      })).sort((a, b) => b.score - a.score);

      io.to(roomId).emit('gameEnd', {
        winner: 'coders',
        leaderboard,
        stats:  { completedTasks: roomCompleted, totalTasks: session.totalTasks },
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
 * Binds all room-related event listeners to a single socket.
 * Call this inside the `io.on('connection', ...)` callback.
 */
function registerRoomHandlers(socket, io) {
  socket.on('createRoom',    (data) => handleCreateRoom(socket, io, data));
  socket.on('joinRoom',      (data) => handleJoinRoom(socket, io, data));
  socket.on('startGame',     (data) => handleStartGame(socket, io, data));
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
  handleStartGame,
  handleTaskComplete,
  handleRecordAttempt,
  broadcastPlayerList,
};
