const express = require("express");
const router = express.Router();

const tasks = require("../data/tasks.json");
const { execute } = require("../services/judge0");
const { validate } = require("../utils/validator");

/**
 * POST /api/tasks/submit
 *
 * Body: { taskId, language, userCode }
 * Returns: { passed, stdout, stderr, time, memory }
 */
router.post("/submit", async (req, res) => {
    try {
        const { taskId, language, userCode } = req.body;

        // --- Validate request ---
        if (!taskId || !language || !userCode) {
            return res
                .status(400)
                .json({ error: "taskId, language, and userCode are required" });
        }

        const task = tasks.find((t) => t.id === taskId);
        if (!task) {
            return res.status(404).json({ error: `Task "${taskId}" not found` });
        }

        console.log("submit hit", { taskId, language });

        // --- Execute via Wandbox ---
        const result = await execute(userCode, language);

        console.log("execution result", result);

        // --- Compare output ---
        const passed = validate(result.stdout, task.expectedOutput);

        return res.json({
            passed,
            stdout: result.stdout,
            stderr: result.stderr,
            time: result.time,
            memory: result.memory,
        });
    } catch (err) {
        console.error("[submit] Error:", err.message);

        const status = err.message.includes("timed out") ? 504 : 502;
        return res.status(status).json({ error: err.message });
    }
});

/**
 * GET /api/tasks
 * Returns all available tasks (id, domain, language, prompt, starterCode).
 */
router.get("/", (_req, res) => {
    const list = tasks.map(({ id, domain, language, prompt, starterCode }) => ({
        id,
        domain,
        language,
        prompt,
        starterCode,
    }));
    res.json(list);
});

module.exports = router;