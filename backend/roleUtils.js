/**
 * roleUtils.js
 * ------------
 * Pure utility functions for role assignment.
 * No Socket.io, no Supabase — entirely stateless and unit-testable.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLES = {
  IMPOSTOR: 'impostor',
  CREWMATE: 'crewmate',
};

/**
 * Impostor count rules:
 *   ≤ 5 players → 1 impostor
 *   > 5 players → 2 impostors
 */
function getImpostorCount(totalPlayers) {
  return totalPlayers <= 5 ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Fisher-Yates shuffle
// ---------------------------------------------------------------------------

/**
 * shuffleArray
 * Returns a NEW shuffled copy of the input array (does not mutate original).
 *
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
function shuffleArray(array) {
  const arr = [...array]; // copy — never mutate caller's array
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Role assignment
// ---------------------------------------------------------------------------

/**
 * assignRoles
 * Shuffles playerIds then assigns impostors to the first N slots.
 * Everyone else becomes a crewmate.
 *
 * @param {string[]} playerIds - Array of socket IDs in the room.
 * @returns {{ assignments: Object.<string, string>, impostors: string[] }}
 *   assignments — map of socketId → role string
 *   impostors   — array of impostor socketIds (for private emission)
 */
function assignRoles(playerIds) {
  if (!playerIds || playerIds.length === 0) {
    throw new Error('[roleUtils] assignRoles: playerIds array is empty');
  }

  const shuffled      = shuffleArray(playerIds);
  const impostorCount = getImpostorCount(shuffled.length);

  const assignments = {};
  const impostors   = [];

  shuffled.forEach((socketId, index) => {
    if (index < impostorCount) {
      assignments[socketId] = ROLES.IMPOSTOR;
      impostors.push(socketId);
    } else {
      assignments[socketId] = ROLES.CREWMATE;
    }
  });

  // Debug log — shows distribution without revealing to players
  console.log(
    `[roleUtils] Assigned roles: ${impostorCount} impostor(s), ` +
    `${shuffled.length - impostorCount} crewmate(s) | ` +
    `Impostors: [${impostors.join(', ')}]`
  );

  return { assignments, impostors };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  assignRoles,
  shuffleArray,
  getImpostorCount,
  ROLES,
};
