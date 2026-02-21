import type { Request, Response } from "express";
import { generatePuzzle } from "../services/llmService.js";
import { runCode } from "../services/judge0Service.js";
import { cachePuzzle, getCachedPuzzle } from "../cache/sessionCache.js";
import type {
  PuzzleGenerateRequest,
  PuzzleData,
  PuzzleSubmitRequest,
  PuzzleSubmitResponse,
} from "../types/puzzle.js";

/**
 * POST /puzzle/generate
 * Body: { domain: string }
 *
 * Generates a coding puzzle for the given domain using an LLM.
 * Caches the result per session (sessionId from header or auto-generated).
 *
 * TODO: integrate with Socket.io to push puzzle to a specific game room
 */
export async function handleGenerate(req: Request, res: Response): Promise<void> {
  const { domain } = req.body as PuzzleGenerateRequest;

  if (!domain || typeof domain !== "string") {
    res.status(400).json({ error: "Missing or invalid 'domain' field in request body." });
    return;
  }

  const sessionId: string =
    (req.headers["x-session-id"] as string | undefined) ?? generateSessionId();

  // Return cached puzzle if available for this session
  const cached = getCachedPuzzle(sessionId);
  if (cached) {
    res.setHeader("x-session-id", sessionId);
    res.json(cached);
    return;
  }

  try {
    const puzzle: PuzzleData = await generatePuzzle(domain);
    cachePuzzle(sessionId, puzzle);
    res.setHeader("x-session-id", sessionId);
    res.json(puzzle);
  } catch (err) {
    console.error("Puzzle generation error:", err);
    res.status(500).json({ error: "Failed to generate puzzle. Please try again." });
  }
}

/**
 * POST /puzzle/submit
 * Body: { sourceCode, testInput, expectedOutput, languageId }
 *
 * Sends the player's code to Judge0, then validates the output.
 *
 * TODO: integrate with Socket.io to broadcast pass/fail result to the game room
 */
export async function handleSubmit(req: Request, res: Response): Promise<void> {
  const { sourceCode, testInput, expectedOutput, languageId } =
    req.body as PuzzleSubmitRequest;

  if (!sourceCode || !languageId || expectedOutput === undefined) {
    res.status(400).json({
      error: "Missing required fields: sourceCode, languageId, expectedOutput.",
    });
    return;
  }

  try {
    const result = await runCode({
      source_code: sourceCode,
      language_id: languageId,
      stdin: testInput ?? "",
    });

    const actualOutput = (result.stdout ?? "").trim();
    const expected = expectedOutput.trim();
    const passed = actualOutput === expected;

    const response: PuzzleSubmitResponse = {
      status: passed ? "passed" : "failed",
      output: actualOutput || result.stderr || result.status.description,
    };

    res.json(response);
  } catch (err) {
    console.error("Puzzle submission error:", err);
    res.status(500).json({ error: "Failed to execute code. Please try again." });
  }
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
