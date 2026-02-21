import axios from "axios";
import type { Judge0Result, Judge0Submission } from "../types/puzzle.js";

const JUDGE0_BASE_URL =
  process.env.JUDGE0_API_URL ?? "https://judge0-ce.p.rapidapi.com";

const JUDGE0_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
  ...(process.env.JUDGE0_API_KEY
    ? { "X-RapidAPI-Key": process.env.JUDGE0_API_KEY }
    : {}),
};

const POLL_INTERVAL_MS = 1000;
const MAX_POLLS = 15;

/**
 * Submits source code to Judge0, polls until completion, and returns the result.
 */
export async function runCode(submission: Judge0Submission): Promise<Judge0Result> {
  const token = await submitCode(submission);
  return pollResult(token);
}

async function submitCode(submission: Judge0Submission): Promise<string> {
  const response = await axios.post<{ token: string }>(
    `${JUDGE0_BASE_URL}/submissions?base64_encoded=false&wait=false`,
    {
      source_code: submission.source_code,
      language_id: submission.language_id,
      stdin: submission.stdin,
    },
    { headers: JUDGE0_HEADERS, timeout: 15000 }
  );
  return response.data.token;
}

async function pollResult(token: string): Promise<Judge0Result> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const response = await axios.get<Judge0Result>(
      `${JUDGE0_BASE_URL}/submissions/${token}?base64_encoded=false`,
      { headers: JUDGE0_HEADERS, timeout: 10000 }
    );

    const result = response.data;
    // Status IDs 1 (In Queue) and 2 (Processing) mean not yet done
    if (result.status.id > 2) {
      return result;
    }
  }

  throw new Error("Judge0 execution timed out after polling");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
