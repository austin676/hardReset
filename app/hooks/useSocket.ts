import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useGameStore } from '../store/gameStore'
import type { Player } from '../store/gameStore'

// Singleton socket instance
let socketInstance: Socket | null = null

const getSocket = (): Socket => {
  if (!socketInstance) {
    const serverUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'
    socketInstance = io(serverUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
    })
  }
  return socketInstance
}

// Backend sends { socketId, alive, avatar, ... } — normalise to store shape
const normalizePlayer = (p: any): Player => ({
  id:              p.socketId,
  name:            p.name,
  color:           p.avatar,          // we store color hex as avatar
  isAlive:         p.alive ?? true,
  tasksCompleted:  p.tasksCompleted ?? 0,
})

export const useSocket = () => {
  const socket = getSocket()
  const connected = useRef(false)

  const {
    setPlayers,
    setRoomCode,
    setMyPlayerId,
    setGamePhase,
    setRoundNumber,
    setTimeLeft,
    addChatMessage,
    setActivityLog,
    addVote,
    clearVotes,
    setEjectedPlayer,
    setWinner,
    setStats,
    setAIReports,
    players,
  } = useGameStore()

  useEffect(() => {
    if (!connected.current) {
      socket.connect()
      connected.current = true
    }

    // ── Room lifecycle (Member 2 backend) ────────────────────────
    socket.on('roomCreated', ({ roomId, players: rawPlayers }: any) => {
      setRoomCode(roomId)
      setMyPlayerId(socket.id!)
      setPlayers(rawPlayers.map(normalizePlayer))
      window.dispatchEvent(new CustomEvent('socket:roomReady'))
    })

    socket.on('roomJoined', ({ roomId, players: rawPlayers }: any) => {
      setRoomCode(roomId)
      setMyPlayerId(socket.id!)
      setPlayers(rawPlayers.map(normalizePlayer))
      window.dispatchEvent(new CustomEvent('socket:roomReady'))
    })

    socket.on('playerListUpdated', ({ players: rawPlayers }: any) => {
      setPlayers(rawPlayers.map(normalizePlayer))
    })

    socket.on('error', ({ message }: { message: string }) => {
      console.error('[socket error]', message)
      // Expose on window so pages can read it
      window.dispatchEvent(new CustomEvent('socket:error', { detail: message }))
    })

    // ── Game events (Member 2 backend) ───────────────────────────
    socket.on('meetingCalled', ({ calledBy, activityLog, players: rawPlayers }: any) => {
      setActivityLog(activityLog)
      if (rawPlayers) setPlayers(rawPlayers.map(normalizePlayer))
      setGamePhase('discussion')
    })

    socket.on('voteResult', ({ ejectedPlayer, wasImposter, votes }: any) => {
      clearVotes()
      Object.entries(votes || {}).forEach(([voterId, targetId]) =>
        addVote(voterId, targetId as string)
      )
      const playerObj = players.find((p) => p.id === ejectedPlayer)
      if (playerObj) setEjectedPlayer(playerObj, wasImposter)
      setGamePhase('ejection')
    })

    socket.on('gameEnd', ({ winner, stats }: any) => {
      setWinner(winner)
      setStats(stats)
      setGamePhase('results')
    })

    socket.on('playerEjected', ({ playerId }: any) => {
      const updated = players.map((p) =>
        p.id === playerId ? { ...p, isAlive: false } : p
      )
      setPlayers(updated)
    })

    socket.on('roundStart', ({ roundNumber }: any) => {
      setRoundNumber(roundNumber)
      setGamePhase('playing')
    })

    socket.on('roundEnd', ({ roundNumber }: any) => {
      setRoundNumber(roundNumber)
    })

    socket.on('timerUpdate', ({ timeLeft }: any) => {
      setTimeLeft(timeLeft)
    })

    // ── Events from Member 3 (task system) ──────────────────────
    socket.on('aiReport', ({ reports }: { reports: Record<string, string> }) => {
      setAIReports(reports)
    })

    socket.on('chatMessage', ({ playerId, message }: any) => {
      addChatMessage({ playerId, message })
    })

    return () => {
      socket.off('roomCreated')
      socket.off('roomJoined')
      socket.off('playerListUpdated')
      socket.off('error')
      socket.off('meetingCalled')
      socket.off('voteResult')
      socket.off('gameEnd')
      socket.off('playerEjected')
      socket.off('roundStart')
      socket.off('roundEnd')
      socket.off('timerUpdate')
      socket.off('aiReport')
      socket.off('chatMessage')
    }
  }, [players])

  // ── Emit helpers ─────────────────────────────────────────────
  const createRoom = (name: string, color: string) =>
    socket.emit('createRoom', { name, avatar: color })

  const joinRoom = (roomId: string, name: string, color: string) =>
    socket.emit('joinRoom', { roomId, name, avatar: color })

  const callMeeting = (calledBy: string) =>
    socket.emit('callMeeting', { calledBy })

  const castVote = (voterId: string, targetId: string) =>
    socket.emit('castVote', { voterId, targetId })

  const sendChatMessage = (playerId: string, message: string) =>
    socket.emit('chatMessage', { playerId, message })

  const sendControllerInput = (direction: string, action?: string) =>
    socket.emit('controllerInput', { direction, action })

  return {
    socket,
    createRoom,
    joinRoom,
    callMeeting,
    castVote,
    sendChatMessage,
    sendControllerInput,
  }
}
