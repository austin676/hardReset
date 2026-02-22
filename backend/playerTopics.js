/**
 * playerTopics.js
 * ----------------
 * Ephemeral in-memory store for player topic preferences.
 * Kept separate to avoid circular dependencies between
 * roomHandlers ↔ taskHandlers.
 */

// { socketId → string[] }
const playerTopics = new Map();

function setPlayerTopics(socketId, topics) {
  if (Array.isArray(topics) && topics.length > 0) {
    playerTopics.set(socketId, topics);
  }
}

function getPlayerTopics(socketId) {
  return playerTopics.get(socketId) ?? ['Arrays', 'Strings'];
}

function deletePlayerTopics(socketId) {
  playerTopics.delete(socketId);
}

module.exports = { setPlayerTopics, getPlayerTopics, deletePlayerTopics };
