import { create } from 'zustand'

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

  // End game
  winner: 'coders' | 'imposter' | null
  ejectedPlayer: Player | null
  wasImposter: boolean | null
  stats: Record<string, any> | null
  aiReports: Record<string, string>

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
  winner: null,
  ejectedPlayer: null,
  wasImposter: null,
  stats: null,
  aiReports: {},
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

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
  setAIReports: (reports) => set({ aiReports: reports }),
  reset: () => set(initialState),
}))
