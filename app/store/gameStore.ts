import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Task } from '../lib/puzzleService'

export interface Player {
  id: string
  name: string
  color: string
  isAlive: boolean
  tasksCompleted: number
}

export type GamePhase = 'lobby' | 'playing' | 'discussion' | 'voting' | 'ejection' | 'results'
export type Role = 'coder' | 'imposter' | null

interface ChatMessage {
  playerId: string
  message: string
  timestamp: number
}

interface GameStore {
  // Identity
  myPlayerId: string | null
  myRole: Role
  roomCode: string | null

  // Players
  players: Player[]

  // Game state
  gamePhase: GamePhase
  roundNumber: number
  timeLeft: number
  abilityPoints: number

  // Discussion
  activityLog: string[]
  votes: Record<string, string> // voterId -> targetId
  chatMessages: ChatMessage[]

  // Tasks
  myTasks: Task[]
  completedTaskIds: string[]
  taskAttempts: Record<string, number>   // taskId → attempt count
  taskModalOpen: boolean
  activeTaskId: string | null
  totalRoomTasks: number
  roomCompletedTasks: number

  // Scoring
  scores: Record<string, number>          // socketId → total score
  roundLeaderboard: { socketId: string; name: string; role: string; score: number }[]
  leaderboardRound: number

  // End game
  winner: 'coders' | 'imposter' | null
  ejectedPlayer: Player | null
  wasImposter: boolean | null
  stats: Record<string, any> | null
  aiReports: Record<string, string>

  // Scoring actions
  setScores: (scores: Record<string, number>) => void
  addScore: (playerId: string, delta: number) => void
  setRoundLeaderboard: (round: number, leaderboard: { socketId: string; name: string; role: string; score: number }[]) => void

  // Actions
  setMyPlayerId: (id: string) => void
  setMyRole: (role: Role) => void
  setRoomCode: (code: string) => void
  setPlayers: (players: Player[]) => void
  setGamePhase: (phase: GamePhase) => void
  setRoundNumber: (round: number) => void
  setTimeLeft: (time: number) => void
  setAbilityPoints: (points: number) => void
  setActivityLog: (log: string[]) => void
  addVote: (voterId: string, targetId: string) => void
  clearVotes: () => void
  addChatMessage: (msg: Omit<ChatMessage, 'timestamp'>) => void
  setEjectedPlayer: (player: Player, wasImposter: boolean) => void
  setWinner: (winner: 'coders' | 'imposter') => void
  setStats: (stats: Record<string, any>) => void
  setAIReports: (reports: Record<string, string>) => void
  setMyTasks: (tasks: Task[]) => void
  markTaskDone: (id: string) => void
  incrementAttempt: (taskId: string) => void
  setTaskModal: (open: boolean, taskId?: string | null) => void
  setRoomTaskProgress: (completed: number, total: number) => void
  reset: () => void
}

const initialState = {
  myPlayerId: null,
  myRole: null as Role,
  roomCode: null,
  players: [],
  gamePhase: 'lobby' as GamePhase,
  roundNumber: 0,
  timeLeft: 180,
  abilityPoints: 0,
  activityLog: [],
  votes: {},
  chatMessages: [],
  myTasks: [] as Task[],
  completedTaskIds: [],
  taskAttempts: {},
  taskModalOpen: false,
  activeTaskId: null,
  totalRoomTasks: 0,
  roomCompletedTasks: 0,
  scores: {},
  roundLeaderboard: [],
  leaderboardRound: 0,
  winner: null,
  ejectedPlayer: null,
  wasImposter: null,
  stats: null,
  aiReports: {},
}

export const useGameStore = create<GameStore>()(
  persist(
    (set) => ({
  ...initialState,

  setScores: (scores) => set({ scores }),
  addScore: (playerId, delta) =>
    set((state) => ({ scores: { ...state.scores, [playerId]: (state.scores[playerId] ?? 0) + delta } })),
  setRoundLeaderboard: (round, leaderboard) => set({ leaderboardRound: round, roundLeaderboard: leaderboard }),

  setMyPlayerId: (id) => set({ myPlayerId: id }),
  setMyRole: (role) => set({ myRole: role }),
  setRoomCode: (code) => set({ roomCode: code }),
  setPlayers: (players) => set({ players }),
  setGamePhase: (phase) => set({ gamePhase: phase }),
  setRoundNumber: (round) => set({ roundNumber: round }),
  setTimeLeft: (time) => set({ timeLeft: time }),
  setAbilityPoints: (points) => set({ abilityPoints: points }),
  setActivityLog: (log) => set({ activityLog: log }),

  addVote: (voterId, targetId) =>
    set((state) => ({ votes: { ...state.votes, [voterId]: targetId } })),

  clearVotes: () => set({ votes: {} }),

  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        { ...msg, timestamp: Date.now() },
      ],
    })),

  setEjectedPlayer: (player, wasImposter) =>
    set({ ejectedPlayer: player, wasImposter }),

  setWinner: (winner) => set({ winner }),
  setStats: (stats) => set({ stats }),
  setAIReports: (reports) => set((state) => ({ aiReports: { ...state.aiReports, ...reports } })),
  setMyTasks: (tasks) => set({ myTasks: tasks }),
  markTaskDone: (id) =>
    set((state) => ({ completedTaskIds: [...new Set([...state.completedTaskIds, id])] })),
  incrementAttempt: (taskId) =>
    set((state) => ({
      taskAttempts: { ...state.taskAttempts, [taskId]: (state.taskAttempts[taskId] ?? 0) + 1 },
    })),
  setTaskModal: (open, taskId = null) => set({ taskModalOpen: open, activeTaskId: taskId }),
  setRoomTaskProgress: (completed, total) =>
    set({ roomCompletedTasks: completed, totalRoomTasks: total }),
  reset: () => set(initialState),
}),
    {
      name: 'hardReset-game-session',
      // Guard against SSR — sessionStorage only exists in the browser
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? sessionStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
      // Only persist the fields needed to survive a refresh
      partialize: (state) => ({
        roomCode:    state.roomCode,
        myPlayerId:  state.myPlayerId,
        players:     state.players,
        myRole:      state.myRole,
        myTasks:     state.myTasks,
        gamePhase:   state.gamePhase,
      }),
    }
  )
)
