/**
 * meetingHandlers.js
 * ------------------
 * Module 5 — Emergency Meeting & Voting System.
 *
 * Listens for:
 *   meetingCalled  — any alive player calls an emergency meeting
 *   vote           — alive players cast their vote during a meeting
 *
 * Emits:
 *   meetingStarted   (broadcast to room)   — meeting began, player list included
 *   voteUpdate       (broadcast to room)   — someone voted (target masked until end)
 *   playerEjected    (broadcast to room)   — majority winner eliminated
 *   meetingEnded     (broadcast to room)   — results, full vote breakdown, new state
 *   error            (private)             — validation failures
 *
 * Integration with other modules:
 *   • Module 3 (movement) — already blocks movement when meetingActive is true
 *   • Module 4 (timer)    — timer paused on meetingCalled, resumed on meetingEnded
 *
 * Called externally:
 *   checkAndResolveIfComplete(roomId, io) — called by roomHandlers on disconnect
 *   so a meeting doesn't stall if a player drops mid-vote.
 */

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

const {
  roomExists,
  isMeetingActive,
  isGameStarted,
  getPlayers,
  getPlayerState,
  setMeetingActive,
  castVote,
  resetAllVotes,
  setPlayerAlive,
} = require('./state');

const {
  getAlivePlayers,
  allAlivePlayersVoted,
  buildVoteTally,
  resolveVotes,
} = require('./votingUtils');

const { pauseRoundTimer, resumeRoundTimer } = require('./timerHandlers');

// ---------------------------------------------------------------------------
// handleMeetingCalled
// ---------------------------------------------------------------------------

/**
 * handleMeetingCalled
 * Triggered when any client emits 'meetingCalled'.
 *
 * Payload: { roomId }
 *
 * Steps:
 *  1. Validate room exists & game is active.
 *  2. Guard: no nested meetings.
 *  3. Pause round timer (preserves remaining seconds).
 *  4. Set meetingActive = true in DB.
 *  5. Reset all previous votes to null.
 *  6. Broadcast meetingStarted with current player snapshots.
 *
 * @param {object} socket
 * @param {import('socket.io').Server} io
 * @param {object} data
 */
async function handleMeetingCalled(socket, io, data) {
  const { roomId } = data || {};
  console.log(`[meetingHandlers] meetingCalled ← socket: ${socket.id} | roomId: ${roomId}`);

  if (!roomId) {
    socket.emit('error', { message: 'meetingCalled requires roomId.' });
    return;
  }

  try {
    // --- Guard: room must exist ------------------------------------------
    const exists = await roomExists(roomId);
    if (!exists) {
      console.warn(`[meetingHandlers] meetingCalled REJECTED — room not found: ${roomId}`);
      socket.emit('error', { message: 'Room not found.' });
      return;
    }

    // --- Guard: game must be running ------------------------------------
    const gameActive = await isGameStarted(roomId);
    if (!gameActive) {
      console.warn(`[meetingHandlers] meetingCalled REJECTED — game not active: ${roomId}`);
      socket.emit('error', { message: 'Game has not started yet.' });
      return;
    }

    // --- Guard: no duplicate meetings -----------------------------------
    const alreadyActive = await isMeetingActive(roomId);
    if (alreadyActive) {
      console.warn(`[meetingHandlers] meetingCalled REJECTED — meeting already active: ${roomId}`);
      socket.emit('error', { message: 'A meeting is already in progress.' });
      return;
    }

    // --- Guard: caller must be alive ------------------------------------
    const caller = await getPlayerState(socket.id);
    if (!caller || !caller.alive) {
      console.warn(`[meetingHandlers] meetingCalled REJECTED — caller dead/not-found: ${socket.id}`);
      socket.emit('error', { message: 'Only alive players can call a meeting.' });
      return;
    }

    // ----------------------------------------------------------------
    // 1. Pause the countdown (stores remaining seconds in-memory)
    // ----------------------------------------------------------------
    pauseRoundTimer(roomId);

    // ----------------------------------------------------------------
    // 2. Flip meeting flag in DB
    // ----------------------------------------------------------------
    await setMeetingActive(roomId, true);

    // ----------------------------------------------------------------
    // 3. Wipe any leftover votes from a previous meeting
    // ----------------------------------------------------------------
    await resetAllVotes(roomId);

    // ----------------------------------------------------------------
    // 4. Broadcast meetingStarted
    // ----------------------------------------------------------------
    const players = await getPlayers(roomId);
    const safeList = players.map(({ socketId, name, avatar, alive, vote }) => ({
      socketId, name, avatar, alive, vote,
    }));

    io.to(roomId).emit('meetingStarted', {
      roomId,
      calledBy: socket.id,
      callerName: caller.name,
      players: safeList,
    });

    console.log(
      `[meetingHandlers] Meeting STARTED in room: ${roomId} | ` +
      `called by: ${socket.id} (${caller.name})`
    );
  } catch (err) {
    console.error(`[meetingHandlers] meetingCalled error:`, err.message);
    socket.emit('error', { message: 'Failed to start meeting. Please try again.' });
  }
}

// ---------------------------------------------------------------------------
// handleVote
// ---------------------------------------------------------------------------

/**
 * handleVote
 * Triggered when an alive player emits 'vote'.
 *
 * Payload: { roomId, targetId }
 *   targetId — socketId of the player to eject, OR the string 'skip'.
 *
 * Steps:
 *  1. Validate meeting is active, voter is alive, no duplicate vote.
 *  2. Validate target is alive (or 'skip').
 *  3. Persist the vote.
 *  4. Broadcast voteUpdate (target masked — only "✓" shown).
 *  5. If all alive players have voted → resolve + end meeting.
 *
 * @param {object} socket
 * @param {import('socket.io').Server} io
 * @param {object} data
 */
async function handleVote(socket, io, data) {
  const { roomId, targetId } = data || {};
  console.log(`[meetingHandlers] vote ← socket: ${socket.id} | roomId: ${roomId} | targetId: ${targetId}`);

  if (!roomId || !targetId) {
    socket.emit('error', { message: 'vote requires roomId and targetId.' });
    return;
  }

  try {
    // --- Guard: meeting must be active -----------------------------------
    const meeting = await isMeetingActive(roomId);
    if (!meeting) {
      console.warn(`[meetingHandlers] vote REJECTED — no active meeting in room: ${roomId}`);
      socket.emit('error', { message: 'No meeting is currently active.' });
      return;
    }

    // --- Guard: voter must exist and be alive ----------------------------
    const voter = await getPlayerState(socket.id);
    if (!voter) {
      console.warn(`[meetingHandlers] vote REJECTED — voter not found: ${socket.id}`);
      socket.emit('error', { message: 'Player not found.' });
      return;
    }

    // --- Guard: voter must belong to this room ---------------------------
    if (voter.roomId !== roomId) {
      console.warn(
        `[meetingHandlers] vote REJECTED — voter ${socket.id} is in room ` +
        `${voter.roomId}, not ${roomId}`
      );
      socket.emit('error', { message: 'You are not in this room.' });
      return;
    }

    if (!voter.alive) {
      console.warn(`[meetingHandlers] vote REJECTED — voter is dead: ${socket.id}`);
      socket.emit('error', { message: 'Dead players cannot vote.' });
      return;
    }

    // --- Guard: prevent duplicate vote -----------------------------------
    if (voter.vote !== null && voter.vote !== undefined) {
      console.warn(`[meetingHandlers] vote REJECTED — duplicate vote from: ${socket.id} (already voted: ${voter.vote})`);
      socket.emit('error', { message: 'You have already voted.' });
      return;
    }

    // --- Guard: validate target ------------------------------------------
    if (targetId !== 'skip') {
      const players = await getPlayers(roomId);
      const target = players.find((p) => p.socketId === targetId);
      if (!target) {
        console.warn(`[meetingHandlers] vote REJECTED — target not found: ${targetId}`);
        socket.emit('error', { message: 'Target player not found in this room.' });
        return;
      }
      if (!target.alive) {
        console.warn(`[meetingHandlers] vote REJECTED — target is dead: ${targetId}`);
        socket.emit('error', { message: 'Cannot vote for a dead player.' });
        return;
      }
      if (targetId === socket.id) {
        console.warn(`[meetingHandlers] vote REJECTED — self-vote attempt: ${socket.id}`);
        socket.emit('error', { message: 'Cannot vote for yourself.' });
        return;
      }
    }

    // ----------------------------------------------------------------
    // 1. Persist vote
    // ----------------------------------------------------------------
    await castVote(socket.id, targetId);
    console.log(
      `[meetingHandlers] Vote cast: ${socket.id} (${voter.name}) → ${targetId} | room: ${roomId}`
    );

    // ----------------------------------------------------------------
    // 2. Broadcast masked vote tally (no targets revealed yet)
    // ----------------------------------------------------------------
    const players = await getPlayers(roomId);
    io.to(roomId).emit('voteUpdate', {
      roomId,
      tally: buildVoteTally(players), // { [socketId]: '✓' | null }
      votedCount:  getAlivePlayers(players).filter((p) => p.vote != null).length,
      totalAlive:  getAlivePlayers(players).length,
    });

    // ----------------------------------------------------------------
    // 3. Auto-resolve when every alive player has voted
    // ----------------------------------------------------------------
    if (allAlivePlayersVoted(players)) {
      await resolveAndEndMeeting(roomId, io);
    }

  } catch (err) {
    console.error(`[meetingHandlers] vote error:`, err.message);
    socket.emit('error', { message: 'Failed to record vote. Please try again.' });
  }
}

// ---------------------------------------------------------------------------
// resolveAndEndMeeting  (internal + exported for disconnect edge-case)
// ---------------------------------------------------------------------------

/**
 * resolveAndEndMeeting
 * Counts votes, ejects the plurality winner (if no tie), resets meeting state,
 * and resumes the round timer.
 *
 * @param {string} roomId
 * @param {import('socket.io').Server} io
 */
async function resolveAndEndMeeting(roomId, io) {
  console.log(`[meetingHandlers] Resolving votes for room: ${roomId}`);

  try {
    const players = await getPlayers(roomId);
    const { ejected, tie, voteCounts } = resolveVotes(players);

    // ----------------------------------------------------------------
    // 1. Eject player if there is a clear plurality winner
    // ----------------------------------------------------------------
    if (ejected) {
      await setPlayerAlive(ejected, false);
      const ejectedPlayer = players.find((p) => p.socketId === ejected);
      io.to(roomId).emit('playerEjected', {
        roomId,
        socketId:  ejected,
        name:      ejectedPlayer?.name  ?? 'Unknown',
        role:      ejectedPlayer?.role  ?? null,
        voteCount: voteCounts[ejected] ?? 0,
      });
      console.log(
        `[meetingHandlers] Player EJECTED: ${ejected} (${ejectedPlayer?.name}) ` +
        `| votes: ${voteCounts[ejected]} | room: ${roomId}`
      );
    } else {
      console.log(
        `[meetingHandlers] No ejection | tie: ${tie} | room: ${roomId}`
      );
    }

    // ----------------------------------------------------------------
    // 2. Clear meeting state in DB
    // ----------------------------------------------------------------
    await setMeetingActive(roomId, false);
    await resetAllVotes(roomId);

    // ----------------------------------------------------------------
    // 3. Fetch final player list (includes the ejected player's new alive=false)
    // ----------------------------------------------------------------
    const finalPlayers = await getPlayers(roomId);

    // ----------------------------------------------------------------
    // 4. Broadcast full results (vote targets now revealed)
    // ----------------------------------------------------------------
    io.to(roomId).emit('meetingEnded', {
      roomId,
      ejected:    ejected ?? null,
      tie,
      voteCounts,               // { [targetId]: count } — full breakdown
      players: finalPlayers.map(({ socketId, name, avatar, alive }) => ({
        socketId, name, avatar, alive,
      })),
    });

    // ----------------------------------------------------------------
    // 5. Resume round timer from where it was paused
    // ----------------------------------------------------------------
    resumeRoundTimer(roomId, io);

    console.log(
      `[meetingHandlers] Meeting ENDED in room: ${roomId} | ` +
      `ejected: ${ejected ?? 'none'} | tie: ${tie}`
    );
  } catch (err) {
    console.error(`[meetingHandlers] resolveAndEndMeeting error:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// checkAndResolveIfComplete
// ---------------------------------------------------------------------------

/**
 * checkAndResolveIfComplete
 * Called by roomHandlers when a player disconnects mid-meeting.
 * If the disconnection means all remaining alive players have now voted
 * (or there are zero votes left outstanding), auto-resolve.
 *
 * No-op if no meeting is currently active.
 *
 * @param {string} roomId
 * @param {import('socket.io').Server} io
 */
async function checkAndResolveIfComplete(roomId, io) {
  try {
    const meeting = await isMeetingActive(roomId);
    if (!meeting) return;

    const players = await getPlayers(roomId);

    // If all alive players have voted (or nobody is alive), resolve
    if (allAlivePlayersVoted(players) || getAlivePlayers(players).length === 0) {
      console.log(
        `[meetingHandlers] Disconnect triggered auto-resolution for room: ${roomId}`
      );
      await resolveAndEndMeeting(roomId, io);
    }
  } catch (err) {
    console.error(`[meetingHandlers] checkAndResolveIfComplete error:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

/**
 * registerMeetingHandlers
 * Binds meeting and voting event listeners to a socket.
 * Call inside io.on('connection', ...) alongside other module registrations.
 *
 * @param {object} socket
 * @param {import('socket.io').Server} io
 */
function registerMeetingHandlers(socket, io) {
  socket.on('meetingCalled', (data) => handleMeetingCalled(socket, io, data));
  socket.on('vote',          (data) => handleVote(socket, io, data));
  console.log(`[meetingHandlers] Handlers registered for socket: ${socket.id}`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  registerMeetingHandlers,
  handleMeetingCalled,
  handleVote,
  resolveAndEndMeeting,
  checkAndResolveIfComplete,
};
