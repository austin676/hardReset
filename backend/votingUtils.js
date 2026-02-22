/**
 * votingUtils.js
 * --------------
 * Module 5 — Pure utility functions for the meeting / voting system.
 * No side effects, no I/O — safe to unit-test in isolation.
 *
 * Operates on the normalised player objects returned by state.getPlayers():
 *   { socketId, name, avatar, role, alive, vote, ... }
 */

// ---------------------------------------------------------------------------
// Player filtering
// ---------------------------------------------------------------------------

/**
 * getAlivePlayers
 * Returns the subset of players that are still alive.
 *
 * @param {object[]} players  - Full player list for a room.
 * @returns {object[]}
 */
function getAlivePlayers(players) {
  return players.filter((p) => p.alive === true);
}

/**
 * getDeadPlayers
 * Returns the subset of players that have been eliminated.
 *
 * @param {object[]} players
 * @returns {object[]}
 */
function getDeadPlayers(players) {
  return players.filter((p) => p.alive === false);
}

// ---------------------------------------------------------------------------
// Vote tracking
// ---------------------------------------------------------------------------

/**
 * allAlivePlayersVoted
 * Returns true once every alive player has cast a vote (including 'skip').
 * An empty alive list returns false — a meeting cannot resolve with nobody.
 *
 * @param {object[]} players
 * @returns {boolean}
 */
function allAlivePlayersVoted(players) {
  const alive = getAlivePlayers(players);
  if (alive.length === 0) return false;
  return alive.every((p) => p.vote !== null && p.vote !== undefined);
}

/**
 * buildVoteTally
 * Returns a map of socketId → vote (null if no vote yet).
 * Used for `voteUpdate` broadcasts — clients see that someone voted
 * but the *target* of each vote is revealed only at meetingEnded.
 *
 * @param {object[]} players
 * @returns {{ [socketId: string]: string|null }}
 */
function buildVoteTally(players) {
  return getAlivePlayers(players).reduce((acc, p) => {
    // Mask the actual target: the client only learns whether a vote exists
    acc[p.socketId] = p.vote != null ? '✓' : null;
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Vote resolution
// ---------------------------------------------------------------------------

/**
 * resolveVotes
 * Counts votes among alive players, determines the plurality winner,
 * and handles ties (returns tiedPlayers for duel).
 *
 * Rules:
 *   • 'skip' votes count toward "no ejection" — they don't count for any target.
 *   • Ties (two or more targets share the highest vote count) → tiedPlayers returned.
 *   • Single plurality winner → ejected.
 *
 * @param {object[]} players  - Full alive player list (dead players ignored).
 *
 * @returns {{
 *   ejected:      string | null,
 *   tie:          boolean,
 *   tiedPlayers:  string[],
 *   voteCounts:   { [targetId: string]: number }
 * }}
 */
function resolveVotes(players) {
  const alive = getAlivePlayers(players);

  // Tally non-skip votes
  const voteCounts = {};
  for (const p of alive) {
    if (!p.vote || p.vote === 'skip') continue;
    voteCounts[p.vote] = (voteCounts[p.vote] ?? 0) + 1;
  }

  const entries = Object.entries(voteCounts);

  // Nobody voted for a real target → no ejection
  if (entries.length === 0) {
    return { ejected: null, tie: false, tiedPlayers: [], voteCounts };
  }

  // Sort descending by vote count
  entries.sort((a, b) => b[1] - a[1]);

  const [topId, topCount] = entries[0];

  // Tie check: collect ALL entries sharing the top vote count
  const tiedEntries = entries.filter(([, count]) => count === topCount);
  if (tiedEntries.length > 1) {
    const tiedPlayers = tiedEntries.map(([id]) => id);
    return { ejected: null, tie: true, tiedPlayers, voteCounts };
  }

  // Single plurality winner
  return { ejected: topId, tie: false, tiedPlayers: [], voteCounts };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getAlivePlayers,
  getDeadPlayers,
  allAlivePlayersVoted,
  buildVoteTally,
  resolveVotes,
};
