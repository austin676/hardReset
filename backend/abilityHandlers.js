/**
 * abilityHandlers.js
 * ------------------
 * Socket.io handlers for imposter abilities.
 *
 * Abilities:
 *   time_bomb       — all crewmates get a 20s countdown on their active puzzle
 *   code_delay      — all crewmates' input is frozen for 8 seconds
 *   syntax_scramble — all crewmates' puzzle is shuffled
 *
 * Event: useAbility   { roomId, abilityType }
 * Emits: abilityReceived { fromId, fromName, abilityType }  → broadcast to all alive crewmates
 */

const { roomExists, getPlayers } = require('./state');

const VALID_ABILITIES = ['time_bomb', 'code_delay', 'syntax_scramble'];

async function handleUseAbility(socket, io, data) {
  const { roomId, abilityType } = data || {};

  if (!roomId || !abilityType) {
    socket.emit('error', { message: 'useAbility: missing roomId or abilityType' });
    return;
  }

  if (!VALID_ABILITIES.includes(abilityType)) {
    socket.emit('error', { message: `Unknown ability: ${abilityType}` });
    return;
  }

  try {
    const exists = await roomExists(roomId);
    if (!exists) {
      socket.emit('error', { message: `Room "${roomId}" not found.` });
      return;
    }

    const players = await getPlayers(roomId);
    const self    = players.find(p => p.socketId === socket.id);

    if (!self) {
      socket.emit('error', { message: 'Player not found in room.' });
      return;
    }

    // Only alive imposter can use abilities
    if (!self.alive) {
      socket.emit('error', { message: 'Dead players cannot use abilities.' });
      return;
    }

    if (self.role !== 'impostor') {
      socket.emit('error', { message: 'Only impostors can use abilities.' });
      return;
    }

    // Broadcast to all alive crewmates (everyone except self)
    const targets = players.filter(p => p.socketId !== socket.id && p.alive);

    for (const target of targets) {
      io.to(target.socketId).emit('abilityReceived', {
        fromId:      socket.id,
        fromName:    self.name,
        abilityType,
      });
    }

    // Confirmation to the imposter
    socket.emit('abilityUsed', {
      abilityType,
      targetCount: targets.length,
      targetNames: targets.map(t => t.name),
    });

    console.log(
      `[abilityHandlers] ${self.name} used ${abilityType} on ${targets.length} player(s) (room: ${roomId})`
    );
  } catch (err) {
    console.error('[abilityHandlers] error:', err.message);
    socket.emit('error', { message: 'Failed to use ability.' });
  }
}

function registerAbilityHandlers(socket, io) {
  socket.on('useAbility', (data) => handleUseAbility(socket, io, data));
}

module.exports = { registerAbilityHandlers };
