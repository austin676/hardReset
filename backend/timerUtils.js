/**
 * timerUtils.js
 * -------------
 * Pure utility functions for timer and timeout logic.
 * No side effects — safe to require anywhere without circular dependency risk.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default round duration in seconds */
const ROUND_DURATION = 180;

/** Default player timeout duration in seconds */
const DEFAULT_TIMEOUT_SECONDS = 30;

// ---------------------------------------------------------------------------
// Timeout helpers
// ---------------------------------------------------------------------------

/**
 * isPlayerTimedOut
 * Returns true if the player currently has an active timeout (i.e. their
 * timeout_until timestamp is in the future).
 *
 * @param {object} player  - Normalised player object from getPlayerState/getPlayers.
 *                           Must contain a `timeoutUntil` field (ISO string or null).
 * @returns {boolean}
 */
function isPlayerTimedOut(player) {
  if (!player || !player.timeoutUntil) return false;
  return Date.now() < new Date(player.timeoutUntil).getTime();
}

/**
 * buildTimeoutUntil
 * Calculates the ISO timestamp that is `seconds` from now.
 * Stored in Supabase as TIMESTAMPTZ.
 *
 * @param {number} seconds
 * @returns {string}  ISO 8601 timestamp
 */
function buildTimeoutUntil(seconds = DEFAULT_TIMEOUT_SECONDS) {
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

/**
 * getRemainingTimeout
 * Returns remaining timeout in whole seconds, or 0 if not timed out.
 *
 * @param {object} player  - Normalised player object with `timeoutUntil`.
 * @returns {number}
 */
function getRemainingTimeout(player) {
  if (!isPlayerTimedOut(player)) return 0;
  return Math.ceil((new Date(player.timeoutUntil).getTime() - Date.now()) / 1_000);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  ROUND_DURATION,
  DEFAULT_TIMEOUT_SECONDS,
  isPlayerTimedOut,
  buildTimeoutUntil,
  getRemainingTimeout,
};
