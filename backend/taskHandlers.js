/**
 * taskHandlers.js
 * ---------------
 * Module 6 — Task Progress Tracking & Sabotage Mechanics.
 *
 * Listens for:
 *   taskInteract  — player walks up to a task station and attempts to interact
 *   taskComplete  — player successfully finishes a task puzzle
 *   sabotage      — impostor spends sabotage points to disable a station
 *
 * Emits:
 *   taskAccessGranted     (private)       — station is open, frontend shows puzzle
 *   taskAccessBlocked     (private)       — station is sabotaged, crewmate is frozen
 *   taskProgressUpdated   (broadcast)     — new global task progress for the room
 *   sabotagePointsUpdated (private)       — impostor's updated sabotage point total
 *   stationSabotaged      (broadcast)     — a station has been sabotaged
 *   sabotageCleared       (broadcast)     — a sabotage expired and station is clean
 *   timeoutStarted        (private)       — re-emitted from applyTimeout (timerHandlers)
 *
 * Sabotage lifecycle:
 *   • Impostor pays SABOTAGE_COST points → station marked sabotaged for 20 s.
 *   • A per-room setInterval checks every 5 s for expired sabotages and clears them.
 *   • When a crewmate tries to interact with a sabotaged station they receive a
 *     SABOTAGE_TIMEOUT_SECONDS movement freeze via Module 4's applyTimeout.
 *   • Impostors completing "tasks" earn SABOTAGE_POINTS_PER_TASK points instead
 *     of contributing to global progress (they're faking the work).
 */

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

const {
  roomExists,
  isMeetingActive,
  getPlayerState,
  getSabotageStations,
  setSabotageStations,
  incrementTasksCompleted,
  awardSabotagePoints,
  incrementRoomTaskProgress,
  getRoomTaskProgress,
} = require('./state');

const {
  SABOTAGE_COST,
  SABOTAGE_POINTS_PER_TASK,
  SABOTAGE_TIMEOUT_SECONDS,
  isSabotaged,
  buildSabotageEntry,
  findExpiredStations,
  removeExpiredFromMap,
} = require('./sabotageUtils');

const { getPlayerTopics } = require('./playerTopics');
const { generateTasksForPlayer } = require('./taskGenerator');
const { applyTimeout } = require('./timerHandlers');

// ---------------------------------------------------------------------------
// In-memory sabotage expiration checkers
// { [roomId]: intervalId }
// Cleared automatically once all sabotages in a room have expired or the room
// is deleted.  Ephemeral — intentionally not persisted.
// ---------------------------------------------------------------------------
const sabotageCheckers = {};

// How often (ms) to poll for expired sabotages.
const EXPIRY_CHECK_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// In-memory room score tracker — avoids DB round-trips on every task completion
// { [roomId]: { [socketId]: number } }
// ---------------------------------------------------------------------------
const roomScores = new Map();

/**
 * getOrInitScores — returns the mutable score object for a room,
 * creating it if it doesn't exist yet.
 */
function getOrInitScores(roomId) {
  if (!roomScores.has(roomId)) roomScores.set(roomId, {});
  return roomScores.get(roomId);
}

// ---------------------------------------------------------------------------
// startSabotageChecker (internal)
// ---------------------------------------------------------------------------

/**
 * startSabotageChecker
 * Starts (or no-ops if already running) a periodic interval that swaps out
 * expired sabotage entries from Supabase and broadcasts sabotageCleared.
 *
 * @param {string} roomId
 * @param {import('socket.io').Server} io
 */
function startSabotageChecker(roomId, io) {
  if (sabotageCheckers[roomId]) return; // already running

  sabotageCheckers[roomId] = setInterval(async () => {
    try {
      const stations = await getSabotageStations(roomId);
      if (!stations || Object.keys(stations).length === 0) {
        // Nothing to watch — stop the checker.
        stopSabotageChecker(roomId);
        return;
      }

      const expired = findExpiredStations(stations);
      if (expired.length === 0) return;

      // Remove expired entries and persist the cleaned map.
      const cleaned = removeExpiredFromMap(stations);
      await setSabotageStations(roomId, cleaned);

      // Notify every client in the room about each cleared station.
      for (const stationId of expired) {
        io.to(roomId).emit('sabotageCleared', { roomId, stationId });
        console.log(`[taskHandlers] Sabotage EXPIRED → room: ${roomId} | station: ${stationId}`);
      }

      // Stop checker if no active sabotages remain.
      if (Object.keys(cleaned).length === 0) {
        stopSabotageChecker(roomId);
      }
    } catch (err) {
      console.error(`[taskHandlers] sabotage checker error (${roomId}):`, err.message);
    }
  }, EXPIRY_CHECK_INTERVAL_MS);

  console.log(`[taskHandlers] Sabotage checker STARTED for room: ${roomId}`);
}

/**
 * stopSabotageChecker
 * Cancels the expiration interval for a room. Safe to call even if none running.
 * Called by roomHandlers when the last player leaves (via stopRoomSabotage export).
 *
 * @param {string} roomId
 */
function stopSabotageChecker(roomId) {
  if (!sabotageCheckers[roomId]) return;
  clearInterval(sabotageCheckers[roomId]);
  delete sabotageCheckers[roomId];
  console.log(`[taskHandlers] Sabotage checker STOPPED for room: ${roomId}`);
}

// ---------------------------------------------------------------------------
// handleTaskInteract
// ---------------------------------------------------------------------------

/**
 * handleTaskInteract
 * Player approaches a task station and attempts to interact.
 *
 * Payload: { roomId, stationId }
 *
 * If the station is currently sabotaged AND the player is a crewmate:
 *   → Apply SABOTAGE_TIMEOUT_SECONDS movement freeze (Module 4).
 *   → Emit taskAccessBlocked to the player (frontend dismisses task UI).
 *
 * Otherwise:
 *   → Emit taskAccessGranted to the player (frontend opens the puzzle).
 *
 * Impostors are never blocked by sabotage — they triggered it.
 *
 * @param {object} socket
 * @param {import('socket.io').Server} io
 * @param {object} data
 */
async function handleTaskInteract(socket, io, data) {
  const { roomId, stationId } = data || {};
  console.log(
    `[taskHandlers] taskInteract ← socket: ${socket.id} | room: ${roomId} | station: ${stationId}`
  );

  if (!roomId || !stationId) {
    socket.emit('error', { message: 'taskInteract requires roomId and stationId.' });
    return;
  }

  try {
    // --- Guard: room must exist -------------------------------------------
    const exists = await roomExists(roomId);
    if (!exists) {
      socket.emit('error', { message: 'Room not found.' });
      return;
    }

    // --- Guard: no interaction during a meeting ---------------------------
    const meeting = await isMeetingActive(roomId);
    if (meeting) {
      socket.emit('error', { message: 'Cannot interact with tasks during a meeting.' });
      return;
    }

    // --- Guard: player must be alive --------------------------------------
    const player = await getPlayerState(socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not found.' });
      return;
    }
    if (!player.alive) {
      socket.emit('error', { message: 'Dead players cannot interact with tasks.' });
      return;
    }

    // --- Sabotage check ---------------------------------------------------
    const stations = await getSabotageStations(roomId);
    const station  = stations?.[stationId];

    if (isSabotaged(station) && player.role !== 'impostor') {
      // Crewmate hit a sabotaged station — freeze them and block access.
      console.warn(
        `[taskHandlers] Station SABOTAGED — applying timeout to crewmate: ${socket.id}`
      );
      await applyTimeout(roomId, socket.id, SABOTAGE_TIMEOUT_SECONDS, io);
      socket.emit('taskAccessBlocked', {
        roomId,
        stationId,
        reason:       'sabotaged',
        timeoutSeconds: SABOTAGE_TIMEOUT_SECONDS,
      });
      return;
    }

    // Station is clean (or player is impostor) — allow access.
    socket.emit('taskAccessGranted', { roomId, stationId });
    console.log(`[taskHandlers] taskAccessGranted → socket: ${socket.id} | station: ${stationId}`);
  } catch (err) {
    console.error(`[taskHandlers] taskInteract error:`, err.message);
    socket.emit('error', { message: 'Failed to interact with task station.' });
  }
}

// ---------------------------------------------------------------------------
// handleTaskComplete
// ---------------------------------------------------------------------------

/**
 * handleTaskComplete
 * Player finishes the task puzzle at a station.
 *
 * Payload: { roomId, stationId }
 *
 * Crewmate path:
 *   • Increment player.tasks_completed in DB.
 *   • Increment room.task_progress in DB.
 *   • Broadcast taskProgressUpdated to the whole room.
 *
 * Impostor path:
 *   • Award SABOTAGE_POINTS_PER_TASK sabotage points.
 *   • Emit sabotagePointsUpdated privately (don't reveal to crewmates).
 *   • Global task_progress is NOT incremented.
 *
 * @param {object} socket
 * @param {import('socket.io').Server} io
 * @param {object} data
 */
async function handleTaskComplete(socket, io, data) {
  const { roomId, stationId } = data || {};
  console.log(
    `[taskHandlers] taskComplete ← socket: ${socket.id} | room: ${roomId} | station: ${stationId}`
  );

  if (!roomId || !stationId) {
    socket.emit('error', { message: 'taskComplete requires roomId and stationId.' });
    return;
  }

  try {
    // --- Guard: room must exist -------------------------------------------
    const exists = await roomExists(roomId);
    if (!exists) {
      socket.emit('error', { message: 'Room not found.' });
      return;
    }

    // --- Guard: no task completion during a meeting -----------------------
    const meeting = await isMeetingActive(roomId);
    if (meeting) {
      socket.emit('error', { message: 'Cannot complete tasks during a meeting.' });
      return;
    }

    // --- Guard: player must be alive --------------------------------------
    const player = await getPlayerState(socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not found.' });
      return;
    }
    if (!player.alive) {
      socket.emit('error', { message: 'Dead players cannot complete tasks.' });
      return;
    }

    // ----------------------------------------------------------------
    // Branch: Crewmate — real progress
    // ----------------------------------------------------------------
    if (player.role !== 'impostor') {
      await incrementTasksCompleted(socket.id);
      await incrementRoomTaskProgress(roomId);

      const newProgress = await getRoomTaskProgress(roomId);

      io.to(roomId).emit('taskProgressUpdated', {
        roomId,
        stationId,
        completedBy:    socket.id,
        playerName:     player.name,
        taskProgress:   newProgress,
      });

      // Update in-memory scores (no DB read required — fast and reliable)
      const scores = getOrInitScores(roomId);
      scores[socket.id] = (scores[socket.id] ?? 0) + 100;

      // Broadcast live score update so the leaderboard refreshes for all players
      io.to(roomId).emit('scoreUpdate', { scores: { ...scores } });

      console.log(
        `[taskHandlers] Task completed (crewmate) — ${player.name} | ` +
        `station: ${stationId} | room progress: ${newProgress} | score: ${scores[socket.id]}`
      );
      return;
    }

    // ----------------------------------------------------------------
    // Branch: Impostor — earns sabotage points instead
    // ----------------------------------------------------------------
    await awardSabotagePoints(socket.id, SABOTAGE_POINTS_PER_TASK);

    const updatedPlayer = await getPlayerState(socket.id);
    socket.emit('sabotagePointsUpdated', {
      roomId,
      socketId:       socket.id,
      sabotagePoints: updatedPlayer.sabotagePoints,
    });

    // Give impostor a fake visible score so they blend into the leaderboard
    // (otherwise their 0 score would immediately reveal them)
    const scores = getOrInitScores(roomId);
    scores[socket.id] = (scores[socket.id] ?? 0) + 100;
    io.to(roomId).emit('scoreUpdate', { scores: { ...scores } });

    console.log(
      `[taskHandlers] Fake task (impostor) — ${player.name} | ` +
      `+${SABOTAGE_POINTS_PER_TASK} pt(s) → total: ${updatedPlayer.sabotagePoints} | fake score: ${scores[socket.id]}`
    );
  } catch (err) {
    console.error(`[taskHandlers] taskComplete error:`, err.message);
    socket.emit('error', { message: 'Failed to record task completion.' });
  }
}

// ---------------------------------------------------------------------------
// handleSabotage
// ---------------------------------------------------------------------------

/**
 * handleSabotage
 * Impostor spends sabotage points to disable a task station.
 *
 * Payload: { roomId, stationId }
 *
 * Guards:
 *   • Player must be an alive impostor.
 *   • Player must have >= SABOTAGE_COST sabotage points.
 *   • Station must not already be actively sabotaged.
 *   • No sabotage during a meeting.
 *
 * On success:
 *   • Deduct SABOTAGE_COST from player.sabotage_points.
 *   • Write sabotage entry into rooms.sabotage_stations.
 *   • Broadcast stationSabotaged to the whole room.
 *   • Emit sabotagePointsUpdated privately to the impostor.
 *   • Start the sabotage expiration checker for this room (if not running).
 *
 * @param {object} socket
 * @param {import('socket.io').Server} io
 * @param {object} data
 */
async function handleSabotage(socket, io, data) {
  const { roomId, stationId } = data || {};
  console.log(
    `[taskHandlers] sabotage ← socket: ${socket.id} | room: ${roomId} | station: ${stationId}`
  );

  if (!roomId || !stationId) {
    socket.emit('error', { message: 'sabotage requires roomId and stationId.' });
    return;
  }

  try {
    // --- Guard: room must exist -------------------------------------------
    const exists = await roomExists(roomId);
    if (!exists) {
      socket.emit('error', { message: 'Room not found.' });
      return;
    }

    // --- Guard: no sabotage during a meeting ------------------------------
    const meeting = await isMeetingActive(roomId);
    if (meeting) {
      socket.emit('error', { message: 'Cannot sabotage during a meeting.' });
      return;
    }

    // --- Guard: player must be alive impostor -----------------------------
    const player = await getPlayerState(socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not found.' });
      return;
    }
    if (!player.alive) {
      console.warn(`[taskHandlers] sabotage REJECTED — player dead: ${socket.id}`);
      socket.emit('error', { message: 'Dead players cannot sabotage.' });
      return;
    }
    if (player.role !== 'impostor') {
      console.warn(`[taskHandlers] sabotage REJECTED — not impostor: ${socket.id}`);
      socket.emit('error', { message: 'Only impostors can sabotage stations.' });
      return;
    }

    // --- Guard: must have enough sabotage points --------------------------
    if (player.sabotagePoints < SABOTAGE_COST) {
      console.warn(
        `[taskHandlers] sabotage REJECTED — insufficient points: ` +
        `${player.sabotagePoints} < ${SABOTAGE_COST} (${socket.id})`
      );
      socket.emit('error', {
        message: `Not enough sabotage points. Need ${SABOTAGE_COST}, have ${player.sabotagePoints}.`,
      });
      return;
    }

    // --- Guard: station must not already be sabotaged --------------------
    const stations = await getSabotageStations(roomId);
    if (isSabotaged(stations?.[stationId])) {
      console.warn(`[taskHandlers] sabotage REJECTED — station already sabotaged: ${stationId}`);
      socket.emit('error', { message: 'This station is already sabotaged.' });
      return;
    }

    // ----------------------------------------------------------------
    // 1. Deduct sabotage cost from impostor
    // ----------------------------------------------------------------
    await awardSabotagePoints(socket.id, -SABOTAGE_COST);

    // ----------------------------------------------------------------
    // 2. Write sabotage entry to DB
    // ----------------------------------------------------------------
    const updatedStations = {
      ...(stations || {}),
      [stationId]: buildSabotageEntry(socket.id),
    };
    await setSabotageStations(roomId, updatedStations);

    // ----------------------------------------------------------------
    // 3. Broadcast sabotage to whole room (crewmates see the alert)
    // ----------------------------------------------------------------
    const expiresIn = Math.round(
      (updatedStations[stationId].expiresAt - Date.now()) / 1_000
    );

    io.to(roomId).emit('stationSabotaged', {
      roomId,
      stationId,
      by:        socket.id,
      expiresIn, // seconds until auto-clear
    });

    // ----------------------------------------------------------------
    // 4. Private confirmation to impostor with updated points
    // ----------------------------------------------------------------
    const updatedPlayer = await getPlayerState(socket.id);
    socket.emit('sabotagePointsUpdated', {
      roomId,
      socketId:       socket.id,
      sabotagePoints: updatedPlayer.sabotagePoints,
    });

    console.log(
      `[taskHandlers] Station SABOTAGED — ${player.name} | station: ${stationId} | ` +
      `remaining points: ${updatedPlayer.sabotagePoints} | room: ${roomId}`
    );

    // ----------------------------------------------------------------
    // 5. Ensure the expiration checker is running for this room
    // ----------------------------------------------------------------
    startSabotageChecker(roomId, io);
  } catch (err) {
    console.error(`[taskHandlers] sabotage error:`, err.message);
    socket.emit('error', { message: 'Failed to apply sabotage.' });
  }
}

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

/**
 * registerTaskHandlers
 * Binds task and sabotage event listeners to a socket.
 * Call inside io.on('connection', ...) alongside other module registrations.
 *
 * @param {object} socket
 * @param {import('socket.io').Server} io
 */
function registerTaskHandlers(socket, io) {
  socket.on('taskInteract',  (data) => handleTaskInteract(socket, io, data));
  socket.on('taskComplete',  (data) => handleTaskComplete(socket, io, data));
  socket.on('sabotage',      (data) => handleSabotage(socket, io, data));
  socket.on('taskExpired',   (data) => handleTaskExpired(socket, io, data));
  console.log(`[taskHandlers] Handlers registered for socket: ${socket.id}`);
}

// ---------------------------------------------------------------------------
// handleTaskExpired — player ran out of time on a task, generate a replacement
// ---------------------------------------------------------------------------
async function handleTaskExpired(socket, io, data) {
  const { roomId, taskId } = data || {};
  if (!roomId || !taskId) return;

  try {
    const topics = getPlayerTopics(socket.id);
    const replacementId = `replaced_${socket.id.slice(-6)}_${Date.now().toString(36)}`;
    const [newTask] = await generateTasksForPlayer(topics, socket.id, 1);
    newTask.id = replacementId;

    socket.emit('taskReplaced', { oldTaskId: taskId, newTask });
    console.log(`[taskHandlers] Task expired → replaced ${taskId} with ${replacementId} for ${socket.id}`);
  } catch (err) {
    console.error(`[taskHandlers] taskExpired error:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  registerTaskHandlers,
  handleTaskInteract,
  handleTaskComplete,
  handleSabotage,
  stopSabotageChecker,   // called by roomHandlers on room deletion
  clearRoomScores: (roomId) => roomScores.delete(roomId), // memory cleanup
};
