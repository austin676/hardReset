import type { PuzzleData } from "../types/puzzle.js";

interface CacheEntry {
  puzzle: PuzzleData;
  createdAt: number;
}

// In-memory cache: sessionId -> PuzzleData
const cache = new Map<string, CacheEntry>();

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export function cachePuzzle(sessionId: string, puzzle: PuzzleData): void {
  cache.set(sessionId, { puzzle, createdAt: Date.now() });
}

export function getCachedPuzzle(sessionId: string): PuzzleData | null {
  const entry = cache.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    cache.delete(sessionId);
    return null;
  }
  return entry.puzzle;
}

export function clearCachedPuzzle(sessionId: string): void {
  cache.delete(sessionId);
}
