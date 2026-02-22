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
const { checkWinCondition }                  = require('./winCondition');
const { stopSabotageChecker }                = require('./taskHandlers');
const { generateTask, fallbackTask }         = require('./taskGenerator');

// In-memory meeting timer per room — auto-resolves after MEETING_DURATION
const meetingTimers = new Map();  // roomId → intervalId
const MEETING_DURATION = 60; // seconds (1 minute)

// In-memory duel state per room
// { puzzle, tiedPlayers, timer, intervalId }
const activeDuels = new Map();
const DUEL_DURATION = 90; // seconds

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
      meetingDuration: MEETING_DURATION,
    });

    // ----------------------------------------------------------------
    // 5. Start a backend meeting timer (30 s) — auto-resolve on expiry
    // ----------------------------------------------------------------
    clearMeetingTimer(roomId); // safety: clear any leftover
    let remaining = MEETING_DURATION;
    const timerInterval = setInterval(async () => {
      remaining -= 1;
      const room = io.sockets.adapter.rooms.get(roomId);
      const roomSize = room ? room.size : 0;
      console.log(`[meetingHandlers] Timer tick: room=${roomId}, remaining=${remaining}, socketsInRoom=${roomSize}`);
      io.to(roomId).emit('meetingTimerSync', { timer: remaining });

      if (remaining <= 0) {
        clearMeetingTimer(roomId);
        console.log(`[meetingHandlers] Meeting timer expired for room: ${roomId} — auto-resolving`);

        // Auto-skip any alive player who hasn't voted yet
        try {
          const currentPlayers = await getPlayers(roomId);
          const alive = getAlivePlayers(currentPlayers);
          for (const p of alive) {
            if (p.vote === null || p.vote === undefined) {
              await castVote(p.socketId, 'skip');
              console.log(`[meetingHandlers] Auto-skip vote for: ${p.socketId} (${p.name})`);
            }
          }
        } catch (err) {
          console.error(`[meetingHandlers] Auto-skip error:`, err.message);
        }

        // Check if meeting is still active (might have been resolved by last vote)
        const stillActive = await isMeetingActive(roomId);
        if (stillActive) {
          await resolveAndEndMeeting(roomId, io);
        }
      }
    }, 1000);
    meetingTimers.set(roomId, timerInterval);

    console.log(
      `[meetingHandlers] Meeting STARTED in room: ${roomId} | ` +
      `called by: ${socket.id} (${caller.name}) | duration: ${MEETING_DURATION}s`
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
    // 3. If all alive players have voted → resolve immediately
    // ----------------------------------------------------------------
    const allVoted = allAlivePlayersVoted(players);
    if (allVoted) {
      console.log(`[meetingHandlers] All alive players voted in room: ${roomId} — resolving early`);
      clearMeetingTimer(roomId); // stop the countdown — no need to wait
      const stillActive = await isMeetingActive(roomId);
      if (stillActive) {
        await resolveAndEndMeeting(roomId, io);
      }
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

  // Clear the backend meeting timer so it doesn't fire again
  clearMeetingTimer(roomId);

  // Guard: prevent double-resolution (timer expiry + last vote can race)
  const stillActive = await isMeetingActive(roomId);
  if (!stillActive) {
    console.log(`[meetingHandlers] Meeting already resolved for room: ${roomId} — skipping`);
    return;
  }

  try {
    const players = await getPlayers(roomId);
    const { ejected, tie, tiedPlayers, voteCounts } = resolveVotes(players);

    // ----------------------------------------------------------------
    // 1a. TIE — start a coding duel instead of ejecting
    // ----------------------------------------------------------------
    if (tie && tiedPlayers.length >= 2) {
      console.log(
        `[meetingHandlers] TIE detected in room: ${roomId} | ` +
        `tied players: ${tiedPlayers.join(', ')} | starting duel`
      );

      // Generate a duel puzzle
      let puzzle;
      try {
        puzzle = await generateTask('Arrays', 'python', `duel_${roomId}_${Date.now()}`);
      } catch (err) {
        console.error(`[meetingHandlers] Failed to generate duel puzzle:`, err.message);
        puzzle = fallbackTask('Arrays', 'python', `duel_${roomId}_${Date.now()}`, 'dsa');
      }

      const duelPuzzle = {
        title:          puzzle.title,
        prompt:         puzzle.prompt,
        starterCode:    puzzle.starterCode,
        expectedOutput: puzzle.expectedOutput,
        language:       puzzle.language,
      };

      // Store duel state in memory
      const duelState = {
        roomId,
        tiedPlayers,
        puzzle: duelPuzzle,
        timer: DUEL_DURATION,
        intervalId: null,
      };

      // Start duel countdown timer
      duelState.intervalId = setInterval(() => {
        duelState.timer -= 1;
        io.to(roomId).emit('duelTimerUpdate', { timer: duelState.timer });

        if (duelState.timer <= 0) {
          clearInterval(duelState.intervalId);
          // Time's up — auto-resolve: both tied players get marked dead
          autoResolveDuel(roomId, io);
        }
      }, 1000);

      activeDuels.set(roomId, duelState);

      // Clear meeting state but keep timer paused
      await setMeetingActive(roomId, false);
      await resetAllVotes(roomId);

      // Broadcast duel start to all players
      io.to(roomId).emit('duelStarted', {
        roomId,
        tiedPlayers,
        puzzle: duelPuzzle,
        timer: DUEL_DURATION,
        voteCounts,
      });

      return; // Don't end meeting normally — duel in progress
    }

    // ----------------------------------------------------------------
    // 1b. Eject player if there is a clear plurality winner
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
    // 4. Broadcast full results (vote targets AND individual votes revealed)
    // ----------------------------------------------------------------
    const individualVotes = finalPlayers.filter(p => p.alive && p.vote).map(p => ({
      voterName: p.name,
      voterId: p.socketId,
      targetName: p.vote === 'skip' ? 'Skip' : finalPlayers.find(t => t.socketId === p.vote)?.name ?? 'Unknown',
      targetId: p.vote
    }));

    io.to(roomId).emit('meetingEnded', {
      roomId,
      ejected:    ejected ?? null,
      tie,
      voteCounts,               // { [targetId]: count } — full breakdown
      individualVotes,          // [{ voterName, voterId, targetName, targetId }]
      players: finalPlayers.map(({ socketId, name, avatar, alive }) => ({
        socketId, name, avatar, alive,
      })),
    });

    // ----------------------------------------------------------------
    // 5. Check win condition before resuming timer
    // ----------------------------------------------------------------
    const gameEnded = await checkWinCondition(roomId, null, io);
    if (gameEnded) {
      stopSabotageChecker(roomId);
      console.log(`[meetingHandlers] Game ended after meeting in room: ${roomId}`);
      return; // gameOver already emitted — do NOT resume timer
    }

    // ----------------------------------------------------------------
    // 6. Resume round timer from where it was paused
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
  // Meeting resolution is now handled exclusively by the 1-minute timer.
  // Disconnects are handled at timer expiry (unvoted players auto-skip).
  return;
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
  socket.on('meetingChat',   (data) => handleMeetingChat(socket, io, data));
  socket.on('duelSubmit',   (data) => handleDuelSubmit(socket, io, data));
  console.log(`[meetingHandlers] Handlers registered for socket: ${socket.id}`);
}

// ---------------------------------------------------------------------------
// handleMeetingChat
// ---------------------------------------------------------------------------

/**
 * handleMeetingChat
 * Broadcasts a chat message to all players in the room during an active meeting
 * or duel. Chat is allowed whenever the game is active and the player is alive,
 * not just when meeting_active is true in the DB (which gets cleared early
 * during vote resolution / duel start).
 *
 * Payload: { roomId, message }
 *
 * Guards:
 *  - Room exists
 *  - Game is started (meeting or duel in progress)
 *  - Sender is alive
 *
 * Emits: meetingChatMessage (broadcast to room)
 */
async function handleMeetingChat(socket, io, data) {
  const { roomId, message } = data || {};
  if (!roomId || !message) {
    socket.emit('error', { message: 'meetingChat requires roomId and message.' });
    return;
  }

  try {
    const exists = await roomExists(roomId);
    if (!exists) { socket.emit('error', { message: 'Room not found.' }); return; }

    // Allow chat whenever the game is active (the meeting UI controls visibility)
    const gameActive = await isGameStarted(roomId);
    if (!gameActive) {
      socket.emit('error', { message: 'Game is not active.' });
      return;
    }

    const sender = await getPlayerState(socket.id);
    if (!sender || !sender.alive) {
      socket.emit('error', { message: 'Dead players cannot chat.' });
      return;
    }

    io.to(roomId).emit('meetingChatMessage', {
      playerId: socket.id,
      playerName: sender.name,
      message: message.slice(0, 200), // cap length
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error(`[meetingHandlers] meetingChat error:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// handleDuelSubmit
// ---------------------------------------------------------------------------

/**
 * handleDuelSubmit
 * A tied player submits their solution during a duel.
 *
 * Payload: { roomId, code }
 *
 * Steps:
 *  1. Validate there's an active duel for this room.
 *  2. Validate the submitter is one of the tied players.
 *  3. Check the code against expected output.
 *  4. If correct → winner, mark other tied player(s) dead, emit duelResult.
 *  5. If wrong → emit duelWrong to just this socket.
 */
async function handleDuelSubmit(socket, io, data) {
  const { roomId, code } = data || {};
  if (!roomId || !code) {
    socket.emit('error', { message: 'duelSubmit requires roomId and code.' });
    return;
  }

  const duel = activeDuels.get(roomId);
  if (!duel) {
    socket.emit('error', { message: 'No active duel in this room.' });
    return;
  }

  // Must be one of the tied players
  if (!duel.tiedPlayers.includes(socket.id)) {
    socket.emit('error', { message: 'You are not part of this duel.' });
    return;
  }

  try {
    // Simple validation: run the code and check stdout against expectedOutput
    const passed = await validateDuelCode(code, duel.puzzle);

    if (passed) {
      // Winner! End the duel.
      clearInterval(duel.intervalId);
      activeDuels.delete(roomId);

      const winnerId = socket.id;
      const losers = duel.tiedPlayers.filter(id => id !== winnerId);

      // Mark losers as dead (they can still do tasks)
      for (const loserId of losers) {
        await setPlayerAlive(loserId, false);
      }

      const players = await getPlayers(roomId);
      const winnerPlayer = players.find(p => p.socketId === winnerId);
      const loserNames = losers.map(id => {
        const p = players.find(pl => pl.socketId === id);
        return p?.name ?? 'Unknown';
      });

      io.to(roomId).emit('duelResult', {
        roomId,
        winnerId,
        winnerName: winnerPlayer?.name ?? 'Unknown',
        losers: losers.map(id => {
          const p = players.find(pl => pl.socketId === id);
          return { socketId: id, name: p?.name ?? 'Unknown', role: p?.role ?? null };
        }),
        players: players.map(({ socketId, name, avatar, alive }) => ({
          socketId, name, avatar, alive,
        })),
      });

      console.log(
        `[meetingHandlers] Duel WON by ${winnerId} (${winnerPlayer?.name}) | ` +
        `losers: ${loserNames.join(', ')} | room: ${roomId}`
      );

      // Check win condition
      const gameEnded = await checkWinCondition(roomId, null, io);
      if (gameEnded) {
        stopSabotageChecker(roomId);
        return;
      }

      // Resume the round timer
      resumeRoundTimer(roomId, io);
    } else {
      // Wrong answer — notify only the submitter
      socket.emit('duelWrong', { message: 'Incorrect — try again!' });
      console.log(`[meetingHandlers] Duel wrong answer from: ${socket.id} | room: ${roomId}`);
    }
  } catch (err) {
    console.error(`[meetingHandlers] duelSubmit error:`, err.message);
    socket.emit('error', { message: 'Failed to validate code.' });
  }
}

// ---------------------------------------------------------------------------
// validateDuelCode  (simple stdout check)
// ---------------------------------------------------------------------------

/**
 * Validates a player's duel submission by comparing stdout to expected output.
 * Uses the puzzle engine if available, otherwise does a simple string match.
 *
 * @param {string} code     - Player's submitted code
 * @param {object} puzzle   - { language, expectedOutput, ... }
 * @returns {Promise<boolean>}
 */
async function validateDuelCode(code, puzzle) {
  const puzzleEngineUrl = process.env.PUZZLE_ENGINE_URL || 'http://localhost:4000';

  try {
    const response = await fetch(`${puzzleEngineUrl}/api/tasks/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: puzzle.language || 'python',
        code: code,
      }),
    });

    if (!response.ok) {
      console.warn(`[validateDuelCode] Puzzle engine returned ${response.status}`);
      // Fallback: simple string comparison
      return simpleCheck(code, puzzle);
    }

    const result = await response.json();
    const stdout = (result.stdout || result.output || '').trim();
    const expected = (puzzle.expectedOutput || '').trim();

    return stdout === expected;
  } catch (err) {
    console.warn(`[validateDuelCode] Puzzle engine unavailable:`, err.message);
    // Fallback: simple string comparison
    return simpleCheck(code, puzzle);
  }
}

/**
 * Simple fallback: check if the expected output appears in the code.
 * Only used when the puzzle engine is unavailable.
 */
function simpleCheck(code, puzzle) {
  const expected = (puzzle.expectedOutput || '').trim();
  // Very basic: check if the code contains a print/console.log of the expected value
  return code.includes(expected);
}

// ---------------------------------------------------------------------------
// autoResolveDuel  (timer expired)
// ---------------------------------------------------------------------------

/**
 * Called when the duel timer reaches 0.
 * Both tied players are marked dead (but can still complete tasks).
 */
async function autoResolveDuel(roomId, io) {
  const duel = activeDuels.get(roomId);
  if (!duel) return;

  activeDuels.delete(roomId);

  console.log(`[meetingHandlers] Duel TIMED OUT — marking all tied players dead | room: ${roomId}`);

  // Mark all tied players dead
  for (const playerId of duel.tiedPlayers) {
    await setPlayerAlive(playerId, false);
  }

  const players = await getPlayers(roomId);

  io.to(roomId).emit('duelResult', {
    roomId,
    winnerId: null, // no winner — timeout
    winnerName: null,
    losers: duel.tiedPlayers.map(id => {
      const p = players.find(pl => pl.socketId === id);
      return { socketId: id, name: p?.name ?? 'Unknown', role: p?.role ?? null };
    }),
    timeout: true,
    players: players.map(({ socketId, name, avatar, alive }) => ({
      socketId, name, avatar, alive,
    })),
  });

  // Check win condition
  const gameEnded = await checkWinCondition(roomId, null, io);
  if (gameEnded) {
    stopSabotageChecker(roomId);
    return;
  }

  // Resume round timer
  resumeRoundTimer(roomId, io);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper: clear meeting timer
// ---------------------------------------------------------------------------
function clearMeetingTimer(roomId) {
  const id = meetingTimers.get(roomId);
  if (id) {
    clearInterval(id);
    meetingTimers.delete(roomId);
  }
}

module.exports = {
  registerMeetingHandlers,
  handleMeetingCalled,
  handleVote,
  handleDuelSubmit,
  resolveAndEndMeeting,
  checkAndResolveIfComplete,
};
