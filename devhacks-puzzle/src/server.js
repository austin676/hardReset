require("dotenv").config();

const express = require("express");
const cors = require("cors");
const tasksRouter = require("./routes/tasks");
const { execute } = require("./services/judge0");

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ──────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ─────────────────────────────────────────
app.use("/api/tasks", tasksRouter);

// Health-check
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Debug: verify Wandbox connectivity ─────────────
app.get("/debug/piston", async (_req, res) => {
    try {
        const result = await execute('print(2+3)', "python");
        res.json({ ok: true, stdout: result.stdout, stderr: result.stderr });
    } catch (err) {
        res.status(502).json({ ok: false, error: err.message });
    }
});

// ── Start ──────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀  task-engine listening on http://localhost:${PORT}`);
});
