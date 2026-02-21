/**
 * puzzleService.ts
 * ----------------
 * Client helpers for the task-engine puzzle microservice (port 4000).
 *
 * Endpoints:
 *   GET  /api/tasks          → list all available puzzles
 *   POST /api/tasks/submit   → submit user code and get a pass/fail result
 */

const BASE_URL =
  import.meta.env.VITE_PUZZLE_ENGINE_URL ?? "http://localhost:4000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  domain: "oops" | "dsa" | "frontend" | string;
  language: "python" | "javascript";
  prompt: string;
  starterCode: string;
}

export interface SubmitResult {
  passed: boolean;
  stdout: string | null;
  stderr: string | null;
  time: number | null;
  memory: number | null;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Fetch all available coding puzzles from the task-engine.
 */
export async function fetchTasks(): Promise<Task[]> {
  const res = await fetch(`${BASE_URL}/api/tasks`);
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.statusText}`);
  return res.json();
}

/**
 * Submit user code for a given task and get a pass/fail verdict.
 *
 * @param taskId   - the puzzle id (e.g. "python_dsa_1")
 * @param language - "python" | "javascript"
 * @param userCode - full source code written by the player
 */
export async function submitCode(
  taskId: string,
  language: string,
  userCode: string
): Promise<SubmitResult> {
  const res = await fetch(`${BASE_URL}/api/tasks/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, language, userCode }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Code submission failed");
  }

  return res.json();
}
