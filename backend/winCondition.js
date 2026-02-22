/**
 * winCondition.js
 * ---------------
 * Pure utility + orchestration for end-of-game checks.
 *
 * Three win conditions:
 *   1. Crewmate task win   — task_progress >= MAX_TASKS
 *   2. Crewmate vote win   — all impostors are dead (ejected)
 *   3. Impostor win        — alive impostors >= alive crewmates
 *
 * checkWinCondition() is called from:
 *   • meetingHandlers.resolveAndEndMeeting  (after an ejection)
 *   • taskHandlers.handleTaskComplete       (after crewmate finishes a task)
 *
 * If a win is detected the function emits `gameOver` to the room,
 * stops timers / sabotage checkers, and marks game_active = false.
 */

const { getPlayers, setGameActive, resetRoomTaskProgress } = require('./state');
const { stopRoomTimer } = require('./timerHandlers');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * MAX_TASKS
 * Number of tasks the crewmate team must collectively complete to win.
 * Adjust to taste — scales with player count if you prefer.
 * For now a single constant keeps the logic simple.
 */
const MAX_TASKS = 10;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * evaluateWin
 * Pure function — no I/O.  Inspects the player list and task progress,
 * returns a result object describing whether the game is over.
 *
 * @param {object[]} players       — normalised player list from state.getPlayers
 * @param {number}   taskProgress  — current room task_progress
 * @returns {{ gameOver: boolean, winner: 'crewmates'|'impostors'|null, reason: string|null }}
 */
function evaluateWin(players, taskProgress) {
  const alive       = players.filter((p) => p.alive);
  const aliveImps   = alive.filter((p) => p.role === 'impostor');
  const aliveCrew   = alive.filter((p) => p.role === 'crewmate');

  // --- Crewmate task win ---------------------------------------------------
  if (taskProgress >= MAX_TASKS) {
    return { gameOver: true, winner: 'crewmates', reason: 'tasks_complete' };
  }

  // --- Crewmate vote win: all impostors dead --------------------------------
  if (aliveImps.length === 0) {
    return { gameOver: true, winner: 'crewmates', reason: 'impostors_eliminated' };
  }

  // --- Impostor win: impostors >= crewmates ---------------------------------
  if (aliveImps.length >= aliveCrew.length) {
    return { gameOver: true, winner: 'impostors', reason: 'impostors_outnumber' };
  }

  return { gameOver: false, winner: null, reason: null };
}

// ---------------------------------------------------------------------------
// Orchestrated check (has side-effects — emits events, stops timers)
// ---------------------------------------------------------------------------

/**
 * checkWinCondition
 * Fetches current state, evaluates the win, and if the game is over:
 *   1. Stops round timer + sabotage checker.
 *   2. Marks the room as game_active = false.
 *   3. Emits `gameOver` to the entire room.
 *
 * Returns true if the game ended (caller should skip any post-check logic
 * like resuming the timer).
 *
 * @param {string} roomId
 * @param {number} taskProgress  — pass this if you already have it from the
 *                                  caller (avoids an extra DB read).  If not
 *                                  provided, the function fetches it.
 * @param {import('socket.io').Server} io
 * @returns {Promise<boolean>}  true if gameOver was emitted
 */
async function checkWinCondition(roomId, taskProgress, io) {
  try {
    const players = await getPlayers(roomId);

    // If taskProgress wasn't supplied, use a rough count from player data.
    // (The room-level value is more accurate but not always passed in.)
    const tp = taskProgress ?? players.reduce((sum, p) => sum + (p.tasksCompleted ?? 0), 0);

    const result = evaluateWin(players, tp);
    if (!result.gameOver) return false;

    // --- Game is over — clean up and notify --------------------------------

    // 1. Stop round timer (sabotage checker stopped by caller to avoid circular deps)
    stopRoomTimer(roomId);

    // 2. Mark game inactive in Supabase
    await setGameActive(roomId, false);

    // 3. Build role reveal for the results screen
    const roleReveal = players.map(({ socketId, name, avatar, role, alive }) => ({
      socketId,
      name,
      avatar,
      role,
      alive,
    }));

    // 4. Broadcast
    io.to(roomId).emit('gameOver', {
      roomId,
      winner:     result.winner,
      reason:     result.reason,
      players:    roleReveal,
    });

    console.log(
      `[winCondition] GAME OVER in room: ${roomId} | ` +
      `winner: ${result.winner} | reason: ${result.reason}`
    );

    return true;
  } catch (err) {
    console.error(`[winCondition] checkWinCondition error:`, err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  MAX_TASKS,
  evaluateWin,
  checkWinCondition,
};
