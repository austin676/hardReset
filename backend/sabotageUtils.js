/**
 * sabotageUtils.js
 * ----------------
 * Module 6 — Pure utility functions for sabotage mechanics.
 * No side effects, no I/O — safe to unit-test in isolation.
 *
 * Sabotage stations are stored in rooms.sabotage_stations (Supabase JSONB):
 *   {
 *     [stationId]: {
 *       sabotaged:  true,
 *       by:         socketId,  // impostor who triggered it
 *       expiresAt:  number,    // Date.now() + duration ms
 *     }
 *   }
 */

// How long (ms) a sabotage effect persists before auto-clearing.
const SABOTAGE_DURATION_MS = 20_000; // 20 seconds

// How many sabotage points an impostor earns per completed task interaction.
// (They click "complete task" on a real station but get sabotage points, not progress.)
const SABOTAGE_POINTS_PER_TASK = 1;

// Cost in sabotage points to trigger one sabotage event.
const SABOTAGE_COST = 2;

// Timeout (seconds) applied to a crewmate who interacts with a sabotaged station.
const SABOTAGE_TIMEOUT_SECONDS = 15;

// ---------------------------------------------------------------------------
// Station state helpers
// ---------------------------------------------------------------------------

/**
 * isSabotaged
 * Returns true if the station has an active (non-expired) sabotage.
 *
 * @param {object|undefined} station  — entry from room.sabotage_stations[stationId]
 * @returns {boolean}
 */
function isSabotaged(station) {
  if (!station || !station.sabotaged) return false;
  return Date.now() < station.expiresAt;
}

/**
 * isExpired
 * Returns true if a sabotage entry exists but its timer has run out.
 *
 * @param {object|undefined} station
 * @returns {boolean}
 */
function isExpired(station) {
  if (!station || !station.sabotaged) return false;
  return Date.now() >= station.expiresAt;
}

/**
 * buildSabotageEntry
 * Creates a new sabotage entry object to store in sabotage_stations.
 *
 * @param {string} socketId  — impostor's socket ID
 * @returns {{ sabotaged: true, by: string, expiresAt: number }}
 */
function buildSabotageEntry(socketId) {
  return {
    sabotaged: true,
    by:        socketId,
    expiresAt: Date.now() + SABOTAGE_DURATION_MS,
  };
}

// ---------------------------------------------------------------------------
// Expiration sweep
// ---------------------------------------------------------------------------

/**
 * findExpiredStations
 * Given the full sabotage_stations map, returns an array of stationIds whose
 * sabotage has expired. Used by the periodic cleaner in taskHandlers.js.
 *
 * @param {Record<string, object>} stations
 * @returns {string[]}  expired stationIds
 */
function findExpiredStations(stations) {
  return Object.entries(stations || {})
    .filter(([, entry]) => isExpired(entry))
    .map(([id]) => id);
}

/**
 * removeExpiredFromMap
 * Returns a new stations map with all expired entries deleted.
 * Pure — does not mutate the input.
 *
 * @param {Record<string, object>} stations
 * @returns {Record<string, object>}
 */
function removeExpiredFromMap(stations) {
  const result = {};
  for (const [id, entry] of Object.entries(stations || {})) {
    if (!isExpired(entry)) result[id] = entry;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  SABOTAGE_DURATION_MS,
  SABOTAGE_POINTS_PER_TASK,
  SABOTAGE_COST,
  SABOTAGE_TIMEOUT_SECONDS,
  isSabotaged,
  isExpired,
  buildSabotageEntry,
  findExpiredStations,
  removeExpiredFromMap,
};
