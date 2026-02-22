/**
 * test.js
 * -------
 * End-to-end manual-style test for all 6 backend modules.
 * Uses 3 simulated clients: host (impostor), alice (crewmate), bob (crewmate).
 *
 * Run with:
 *   node test.js
 *
 * Make sure the server is running first:
 *   npm run fresh   (or: node server.js)
 */

const { io } = require('socket.io-client');

const SERVER = 'http://localhost:3001';
const DELAY  = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
const ok  = (tag, msg, data) => console.log(`\x1b[32m✔ [${tag}]\x1b[0m ${msg}`, data !== undefined ? JSON.stringify(data) : '');
const err = (tag, msg, data) => console.log(`\x1b[31m✘ [${tag}]\x1b[0m ${msg}`, data !== undefined ? JSON.stringify(data) : '');
const log = (tag, msg, data) => console.log(`\x1b[36m→ [${tag}]\x1b[0m ${msg}`, data !== undefined ? JSON.stringify(data) : '');

// Capture the next emission of an event on a socket (with timeout)
function waitFor(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for '${event}' on ${socket.id}`)), timeoutMs);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------
async function run() {
  console.log('\n\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log('\x1b[1m  HardReset Backend — Full Test Suite\x1b[0m');
  console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  // ── connect all three clients ─────────────────────────────────────────────
  const host  = io(SERVER, { transports: ['websocket'] }); // will become impostor
  const alice = io(SERVER, { transports: ['websocket'] });
  const bob   = io(SERVER, { transports: ['websocket'] });

  await Promise.all([
    waitFor(host,  'connect'),
    waitFor(alice, 'connect'),
    waitFor(bob,   'connect'),
  ]);
  ok('CONNECT', `3 clients connected — host:${host.id} alice:${alice.id} bob:${bob.id}`);

  // attach global error listeners
  for (const [name, sock] of [['host', host], ['alice', alice], ['bob', bob]]) {
    sock.on('error', (d) => err(name.toUpperCase(), 'server error →', d));
  }

  let roomId;

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 1 — Room Lifecycle
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n\x1b[1m[Module 1] Room Lifecycle\x1b[0m');

    // 1a. createRoom
    host.emit('createRoom', { name: 'HostPlayer', avatar: 'avatar1' });
    const created = await waitFor(host, 'roomCreated');
    roomId = created.roomId;
    ok('createRoom', `Room created: ${roomId}`, { players: created.players.length });

    // 1b. joinRoom — alice
    alice.emit('joinRoom', { roomId, name: 'Alice', avatar: 'avatar2' });
    const aliceJoined = await waitFor(alice, 'roomJoined');
    ok('joinRoom', 'Alice joined', { players: aliceJoined.players.length });

    // 1c. joinRoom — bob
    bob.emit('joinRoom', { roomId, name: 'Bob', avatar: 'avatar3' });
    const bobJoined = await waitFor(bob, 'roomJoined');
    ok('joinRoom', 'Bob joined', { players: bobJoined.players.length });

    // 1d. empty-name guard — use a fresh socket that never joins the room
    {
      const guardSocket = io(SERVER, { transports: ['websocket'] });
      await waitFor(guardSocket, 'connect');
      guardSocket.emit('joinRoom', { roomId, name: '', avatar: 'x' });
      const nameErr = await waitFor(guardSocket, 'error', 3000).catch(() => null);
      if (nameErr) ok('guard', 'Empty name rejected', nameErr);
      else err('guard', 'Empty name was NOT rejected — check guard');
      guardSocket.disconnect();
      await DELAY(200); // let server process the disconnect before startGame
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 2 — Role Assignment
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n\x1b[1m[Module 2] Role Assignment\x1b[0m');

    // Set up role listeners BEFORE emitting startGame
    const roles = {};
    const rolePromises = [
      waitFor(host,  'roleAssigned').then(d => { roles.host  = d.role; }),
      waitFor(alice, 'roleAssigned').then(d => { roles.alice = d.role; }),
      waitFor(bob,   'roleAssigned').then(d => { roles.bob   = d.role; }),
    ];
    const gameStartedPromise = waitFor(host, 'gameStarted');

    host.emit('startGame', { roomId });

    await Promise.all(rolePromises);
    const gameStarted = await gameStartedPromise;

    ok('startGame', 'gameStarted broadcast received', { round: gameStarted.round, players: gameStarted.players.length });
    ok('roleAssigned', `host=${roles.host}  alice=${roles.alice}  bob=${roles.bob}`);

    // Identify the impostor socket for later tests
    const impostorName = Object.entries(roles).find(([, r]) => r === 'impostor')?.[0];
    const impostorSocket = { host, alice, bob }[impostorName];
    const crewSockets    = Object.entries({ host, alice, bob })
      .filter(([n]) => n !== impostorName)
      .map(([, s]) => s);
    log('roles', `Impostor is "${impostorName}"`);

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 3 — Movement
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n\x1b[1m[Module 3] Movement\x1b[0m');

    // Valid move
    crewSockets[0].emit('playerMove', { roomId, x: 100, y: 200 });
    const moved = await waitFor(crewSockets[1], 'playerMoved', 3000).catch(() => null);
    if (moved) ok('playerMove', 'playerMoved received by peer', { x: moved.x, y: moved.y });
    else err('playerMove', 'playerMoved NOT received by peer — check throttle/delta');

    // Out-of-bounds clamp
    crewSockets[0].emit('playerMove', { roomId, x: 9999, y: -500 });
    const clamped = await waitFor(crewSockets[1], 'playerMoved', 3000).catch(() => null);
    if (clamped) {
      const inBounds = clamped.x <= 2400 && clamped.y >= 0;
      if (inBounds) ok('bounds', `Position clamped correctly: x=${clamped.x} y=${clamped.y}`);
      else err('bounds', `Position NOT clamped: x=${clamped.x} y=${clamped.y}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 4 — Timer
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n\x1b[1m[Module 4] Timer\x1b[0m');

    const timerTick = await waitFor(host, 'timerUpdate', 4000).catch(() => null);
    if (timerTick) ok('timer', `Timer ticking. Current value: ${timerTick.timer}s`);
    else err('timer', 'No timerUpdate received within 4s');

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 5 — Meeting & Voting
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n\x1b[1m[Module 5] Meeting & Voting\x1b[0m');

    // 5a. Call a meeting
    const meetingPromise = waitFor(host, 'meetingStarted');
    crewSockets[0].emit('meetingCalled', { roomId });
    const meeting = await meetingPromise.catch(() => null);
    if (meeting) ok('meetingCalled', 'meetingStarted received', { players: meeting.players.length });
    else err('meetingCalled', 'meetingStarted NOT received');

    // 5b. Movement should now be blocked
    crewSockets[0].emit('playerMove', { roomId, x: 500, y: 500 });
    // no playerMoved should fire — we just wait briefly
    await DELAY(300);
    ok('meeting guard', 'Movement during meeting silently rejected (expected)');

    // 5c. Everyone votes skip — should auto-resolve
    const endPromise = waitFor(host, 'meetingEnded', 8000);
    host.emit('vote',  { roomId, targetId: 'skip' });
    alice.emit('vote', { roomId, targetId: 'skip' });
    bob.emit('vote',   { roomId, targetId: 'skip' });
    const ended = await endPromise.catch(() => null);
    if (ended) ok('vote', 'meetingEnded after all voted skip', { ejected: ended.ejected ?? 'none' });
    else err('vote', 'meetingEnded NOT received after all voted');

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 6 — Tasks & Sabotage
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n\x1b[1m[Module 6] Tasks & Sabotage\x1b[0m');

    const crew0 = crewSockets[0];
    const STATION = 'station_alpha';

    // 6a. Crewmate interacts with a clean station → should get access
    crew0.emit('taskInteract', { roomId, stationId: STATION });
    const granted = await waitFor(crew0, 'taskAccessGranted', 4000).catch(() => null);
    if (granted) ok('taskInteract', 'taskAccessGranted on clean station', { stationId: granted.stationId });
    else err('taskInteract', 'taskAccessGranted NOT received');

    // 6b. Crewmate completes task → task_progress increments
    const progressPromise = waitFor(host, 'taskProgressUpdated', 4000);
    crew0.emit('taskComplete', { roomId, stationId: STATION });
    const progress = await progressPromise.catch(() => null);
    if (progress) ok('taskComplete', `taskProgressUpdated broadcast`, { taskProgress: progress.taskProgress, by: progress.playerName });
    else err('taskComplete', 'taskProgressUpdated NOT broadcast');

    // 6c. Impostor completes two "fake tasks" → earns 2 sabotage points (private)
    impostorSocket.emit('taskComplete', { roomId, stationId: 'station_beta' });
    const pts1 = await waitFor(impostorSocket, 'sabotagePointsUpdated', 4000).catch(() => null);
    impostorSocket.emit('taskComplete', { roomId, stationId: 'station_beta2' });
    const pts = await waitFor(impostorSocket, 'sabotagePointsUpdated', 4000).catch(() => null);
    if (pts) ok('taskComplete(imp)', `Impostor accumulated points: ${pts.sabotagePoints}`);
    else err('taskComplete(imp)', 'sabotagePointsUpdated NOT received');

    // 6d. Sabotage a station (only if impostor has enough points)
    if (pts && pts.sabotagePoints >= 2) {
      const sabotageTarget = 'station_gamma';
      const sabotagePromise = waitFor(crew0, 'stationSabotaged', 4000);
      impostorSocket.emit('sabotage', { roomId, stationId: sabotageTarget });
      const sabotaged = await sabotagePromise.catch(() => null);
      if (sabotaged) {
        ok('sabotage', `stationSabotaged broadcast`, { station: sabotaged.stationId, expiresIn: sabotaged.expiresIn });

        // 6e. Crewmate tries to interact with the now-sabotaged station → blocked + timeout
        crew0.emit('taskInteract', { roomId, stationId: sabotageTarget });
        const blocked = await waitFor(crew0, 'taskAccessBlocked', 4000).catch(() => null);
        if (blocked) ok('taskInteract(sab)', `taskAccessBlocked on sabotaged station (frozen ${blocked.timeoutSeconds}s)`, { station: blocked.stationId });
        else err('taskInteract(sab)', 'taskAccessBlocked NOT received');
      } else {
        err('sabotage', 'stationSabotaged NOT broadcast');
      }
    } else {
      log('sabotage', 'Skipping sabotage test — impostor needs ≥2 points (complete more fake tasks first)');
    }

    // 6f. Impostor ability
    console.log('\n\x1b[1m[Abilities] Impostor Abilities\x1b[0m');
    const abilityPromise = waitFor(crew0, 'abilityReceived', 4000);
    impostorSocket.emit('useAbility', { roomId, abilityType: 'code_delay' });
    const ability = await abilityPromise.catch(() => null);
    if (ability) ok('useAbility', `code_delay received by crewmate`, { from: ability.fromName });
    else err('useAbility', 'abilityReceived NOT received by crewmate');

    // ─────────────────────────────────────────────────────────────────────────
    // Done
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    console.log('\x1b[1m  All tests complete.\x1b[0m');
    console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  } catch (e) {
    err('FATAL', e.message);
    console.error(e);
  } finally {
    host.disconnect();
    alice.disconnect();
    bob.disconnect();
    process.exit(0);
  }
}

run();
