import type { Player } from '../store/gameStore'

export const MOCK_PLAYERS: Player[] = [
  { id: 'p1', name: 'Shafiq', color: '#00d4ff', isAlive: true, tasksCompleted: 3 },
  { id: 'p2', name: 'Alex', color: '#ff3366', isAlive: true, tasksCompleted: 2 },
  { id: 'p3', name: 'Jordan', color: '#00ff88', isAlive: true, tasksCompleted: 4 },
  { id: 'p4', name: 'Sam', color: '#ffaa00', isAlive: false, tasksCompleted: 1 },
]

export const MOCK_ACTIVITY_LOG = [
  'Shafiq completed a task at Station 2',
  'Alex was seen near Station 4',
  'Jordan completed a task at Station 1',
  'Sam reported suspicious activity',
  'Station 3 was sabotaged',
]

export const MOCK_CHAT_MESSAGES = [
  { playerId: 'p1', message: 'I saw Alex near the sabotaged station!', timestamp: Date.now() - 5000 },
  { playerId: 'p2', message: 'No way, I was doing my task!', timestamp: Date.now() - 4000 },
  { playerId: 'p3', message: 'Jordan is sus, they were afk for ages', timestamp: Date.now() - 3000 },
  { playerId: 'p4', message: 'Vote Sam out, 100%', timestamp: Date.now() - 2000 },
]

export const MOCK_AI_REPORT = `## Your Performance Report

**Overall Score: 7.2/10**

### Strengths
- Strong understanding of array methods (completed 3/3 tasks)
- Quick problem solving on recursion tasks (~45s avg)

### Areas to Improve
- TypeScript generics — missed 2 type annotations
- Edge case handling in string manipulation tasks

### Recommended Practice
1. Practice TypeScript generics on TypeHero
2. Leetcode: Two Sum, Valid Parentheses, Merge Intervals

Keep it up! Your speed improved 23% from last session.`

// Simulates delays for mock socket events
export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms))
