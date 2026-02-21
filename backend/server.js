/**
 * server.js
 * ---------
 * Entry point for the HardReset game backend.
 *
 * Responsibilities:
 *   - Load environment variables from .env
 *   - Spin up a lightweight HTTP server
 *   - Attach a Socket.io server with CORS configured for local dev
 *   - Delegate all socket event handling to roomHandlers.js
 *
 * Run with:
 *   node server.js          (production)
 *   npx nodemon server.js   (development — auto-restarts on file changes)
 */

require('dotenv').config();   // ← must be first so supabase.js can read vars

const http = require('http');
const { Server } = require('socket.io');
const { registerRoomHandlers }     = require('./roomHandlers');
const { registerRoleHandlers }     = require('./roleHandlers');
const { registerMovementHandlers } = require('./movementHandlers');
const { registerMeetingHandlers }  = require('./meetingHandlers');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;

// Origins allowed to connect via Socket.io.
// In production you would restrict this to your deployed front-end URL.
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

// A bare Node.js HTTP server — Socket.io attaches to it directly.
// If you want to add REST endpoints later, swap this for an Express app.
const httpServer = http.createServer((req, res) => {
  // Minimal health-check endpoint so infrastructure probes don't return 404.
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ---------------------------------------------------------------------------
// Socket.io setup
// ---------------------------------------------------------------------------

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  console.log(`[server] Client connected  — socket: ${socket.id}`);

  // Register all room-related event listeners for this socket.
  registerRoomHandlers(socket, io);

  // Register game-start and role-assignment listeners (Module 2).
  registerRoleHandlers(socket, io);

  // Register real-time movement synchronisation listeners (Module 3).
  registerMovementHandlers(socket, io);

  // Register emergency meeting and voting listeners (Module 5).
  registerMeetingHandlers(socket, io);

  // Log clean disconnections for visibility (the handler in roomHandlers.js
  // takes care of state cleanup; this is purely for server-level logging).
  socket.on('disconnect', (reason) => {
    console.log(`[server] Client disconnected — socket: ${socket.id} | reason: ${reason}`);
  });
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(`[server] HardReset backend running on port ${PORT}`);
  console.log(`[server] Accepting connections from: ${CORS_ORIGIN}`);
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} is already in use. Kill the old process and restart.`);
    process.exit(1);
  } else {
    throw err;
  }
});
