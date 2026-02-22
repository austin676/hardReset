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

export { getSocket }

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
    setVoteTally,
    setEjectedPlayer,
    setWinner,
    setStats,
    setAIReports,
    setMyRole,
    setMyTasks,
    markTaskDone,
    setTaskModal,
    setRoomTaskProgress,
    setScores,
    addScore,
    setRoundLeaderboard,
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
    socket.on('meetingStarted', ({ players: rawPlayers }: any) => {
      if (rawPlayers) setPlayers(rawPlayers.map(normalizePlayer))
      setGamePhase('discussion')
    })

    // ── Vote tally update (targets stay masked until meetingEnded) ──────────
    socket.on('voteUpdate', ({ tally }: any) => {
      if (!tally) return
      const boolTally: Record<string, boolean> = {}
      Object.entries(tally).forEach(([id, val]) => { boolTally[id] = val === '✓' })
      setVoteTally(boolTally)
    })

    socket.on('meetingEnded', ({ ejected, players: rawPlayers }: any) => {
      clearVotes()
      if (rawPlayers) setPlayers(rawPlayers.map(normalizePlayer))
      // If nobody was ejected, go straight back to playing.
      // If ejected is set, playerEjected already set phase to 'ejection'.
      if (!ejected) setGamePhase('playing')
    })

    socket.on('gameEnd', ({ winner, stats, leaderboard }: any) => {
      setWinner(winner)
      setStats(stats)
      if (leaderboard) setRoundLeaderboard(0, leaderboard)
      setGamePhase('results')
    })

    socket.on('playerEjected', ({ socketId, role }: any) => {
      const updated = players.map((p) =>
        p.id === socketId ? { ...p, isAlive: false } : p
      )
      setPlayers(updated)
      const playerObj = players.find((p) => p.id === socketId)
      if (playerObj) setEjectedPlayer(playerObj, role === 'impostor')
      setGamePhase('ejection')
    })

    socket.on('roundStart', ({ round, myTasks, scores: allScores }: any) => {
      setRoundNumber(round)
      if (myTasks) setMyTasks(myTasks)
      if (allScores) setScores(allScores)
      setGamePhase('playing')
    })

    // ── Private role assignment (impostor or crewmate) ───────────────────────
    socket.on('roleAssigned', ({ role }: any) => {
      if (role) setMyRole(role === 'impostor' ? 'imposter' : 'coder')
    })

    // ── Imposter ability received — forward into Phaser event bus ────────────
    socket.on('abilityReceived', ({ fromId, fromName, abilityType }: any) => {
      import('~/game/GameEventBus').then(({ gameEventBus }) => {
        gameEventBus.emit('ability:received', { fromId, fromName, abilityType })
      })
    })

    // ── Ability used confirmation ──────────────────────────────────────────────
    socket.on('abilityUsed', ({ abilityType, targetName }: any) => {
      import('~/game/GameEventBus').then(({ gameEventBus }) => {
        gameEventBus.emit('ability:used', { abilityType, targetName })
      })
    })

    // ── Task events (puzzle engine integration) ──────────────────
    socket.on('gameStarted', ({ round, players: allPlayers }: any) => {
      if (round) setRoundNumber(round)
      if (Array.isArray(allPlayers)) setPlayers(allPlayers.map(normalizePlayer))
      setGamePhase('playing')
      window.dispatchEvent(new CustomEvent('socket:gameStarted'))
    })

    socket.on('tasksAssigned', ({ myTasks, totalRoomTasks, roomCompletedTasks, roundNumber, players: allPlayers }: any) => {
      setMyTasks(myTasks)
      setRoomTaskProgress(roomCompletedTasks, totalRoomTasks)
      setRoundNumber(roundNumber)
      setGamePhase('playing')
      if (Array.isArray(allPlayers)) setPlayers(allPlayers.map(normalizePlayer))
      window.dispatchEvent(new CustomEvent('socket:gameStarted'))
    })

    // ── Real-time movement: forward other players into Phaser ────────────────
    socket.on('playerMoved', ({ socketId, position, direction }: any) => {
      if (socketId === socket.id) return  // ignore echo (shouldn't happen)
      // Look up this player in the store to get name + color
      const { players: storePlayers } = useGameStore.getState()
      const found = storePlayers.find((p) => p.id === socketId)
      const colorNum = found?.color
        ? (typeof found.color === 'string'
            ? parseInt((found.color as string).replace('#', ''), 16)
            : (found.color as unknown as number))
        : 0xef4444

      import('~/game/GameEventBus').then(({ gameEventBus }) => {
        gameEventBus.emit('remote:player:move', {
          id:        socketId,
          x:         position.x,
          y:         position.y,
          direction: direction ?? 'down',
          isMoving:  true,
          role:      'agent',
          name:      found?.name ?? '???',
          color:     colorNum,
          alive:     found?.isAlive ?? true,
        })
      })
    })

    // ── Player left: remove from Phaser world ────────────────────────────────
    socket.on('playerLeft', ({ socketId }: any) => {
      import('~/game/GameEventBus').then(({ gameEventBus }) => {
        gameEventBus.emit('player:leave', { id: socketId })
      })
    })

    socket.on('taskCompleted', ({ playerId, taskId, roomCompletedTasks, totalRoomTasks }: any) => {
      // If this is our task, mark it locally too
      if (playerId === socket.id) markTaskDone(taskId)
      setRoomTaskProgress(roomCompletedTasks, totalRoomTasks)
    })

    socket.on('activityUpdate', ({ message }: { message: string }) => {
      const { activityLog } = useGameStore.getState()
      setActivityLog([message, ...activityLog].slice(0, 20))
    })

    socket.on('roundEnd', ({ round, leaderboard }: any) => {
      setRoundNumber(round)
      if (leaderboard) {
        setRoundLeaderboard(round, leaderboard)
        import('~/game/GameEventBus').then(({ gameEventBus }) => {
          gameEventBus.emit('round:end', { round, leaderboard })
        })
      }
    })

    socket.on('scoreUpdate', ({ scores: allScores }: any) => {
      if (allScores) setScores(allScores)
    })

    socket.on('timerUpdate', ({ timer }: any) => {
      setTimeLeft(timer)
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
      socket.off('meetingStarted')
      socket.off('voteUpdate')
      socket.off('meetingEnded')
      socket.off('gameEnd')
      socket.off('playerEjected')
      socket.off('roundStart')
      socket.off('roundEnd')
      socket.off('timerUpdate')
      socket.off('aiReport')
      socket.off('chatMessage')
      socket.off('gameStarted')
      socket.off('tasksAssigned')
      socket.off('taskCompleted')
      socket.off('activityUpdate')
      socket.off('playerMoved')
      socket.off('playerLeft')
      socket.off('roleAssigned')
      socket.off('abilityReceived')
      socket.off('abilityUsed')
    socket.off('scoreUpdate')
    }

  }, [players])

  // ── Emit helpers ─────────────────────────────────────────────
  const createRoom = (name: string, color: string, topics: string[] = []) =>
    socket.emit('createRoom', { name, avatar: color, topics })

  const joinRoom = (roomId: string, name: string, color: string, topics: string[] = []) =>
    socket.emit('joinRoom', { roomId, name, avatar: color, topics })

  const callMeeting = (_calledBy?: string) => {
    const roomCode = useGameStore.getState().roomCode
    socket.emit('meetingCalled', { roomId: roomCode })
  }

  const castVote = (_voterId: string, targetId: string) => {
    const roomCode = useGameStore.getState().roomCode
    socket.emit('vote', { roomId: roomCode, targetId })
  }

  const sendChatMessage = (playerId: string, message: string) =>
    socket.emit('chatMessage', { playerId, message })

  const sendControllerInput = (direction: string, action?: string) =>
    socket.emit('controllerInput', { direction, action })

  const emitStartGame = (roomId: string) =>
    socket.emit('startGame', { roomId })

  const emitTaskComplete = (roomId: string, taskId: string) =>
    socket.emit('taskComplete', { roomId, taskId })

  const emitRecordAttempt = (roomId: string, taskId: string, passed: boolean, userCode: string) =>
    socket.emit('recordAttempt', { roomId, taskId, passed, userCode })

  const useAbility = (roomId: string, abilityType: string) =>
    socket.emit('useAbility', { roomId, abilityType })

  return {
    socket,
    createRoom,
    joinRoom,
    callMeeting,
    castVote,
    sendChatMessage,
    sendControllerInput,
    emitStartGame,
    emitTaskComplete,
    emitRecordAttempt,
    useAbility,
  }
}
