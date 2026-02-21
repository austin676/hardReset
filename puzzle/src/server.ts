import express from "express";
import cors from "cors";
import { handleGenerate, handleSubmit } from "./controllers/puzzleController.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "puzzle-game" });
});

// Puzzle routes
app.post("/puzzle/generate", handleGenerate);
app.post("/puzzle/submit", handleSubmit);

// TODO: integrate Socket.io for real-time multiplayer events
// Example:
//   import { Server } from "socket.io";
//   const io = new Server(httpServer);
//   io.on("connection", (socket) => {
//     socket.on("puzzle:request", async ({ domain, sessionId }) => { ... });
//     socket.on("puzzle:submit", async (payload) => { ... });
//   });

app.listen(PORT, () => {
  console.log(`Puzzle.Game service running on http://localhost:${PORT}`);
});

export default app;
