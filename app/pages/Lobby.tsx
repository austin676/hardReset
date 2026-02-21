import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import Crewmate from '../components/Crewmate'

export default function Lobby() {
  const { roomCode, players, myPlayerId } = useGameStore()
  const { emitStartGame } = useSocket()
  const navigate = useNavigate()

  const isHost = players.length > 0 && players[0]?.id === myPlayerId
  const canStart = players.length >= 2

  // Navigate to game screen when game starts
  useEffect(() => {
    const onGameStarted = () => navigate('/game')
    window.addEventListener('socket:gameStarted', onGameStarted)
    return () => window.removeEventListener('socket:gameStarted', onGameStarted)
  }, [navigate])

  return (
    <div className="min-h-screen bg-[#10122a] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Room code */}
        <div>
          <p className="text-[#9090b0] text-xs font-black tracking-widest uppercase mb-2">Share This Code</p>
          <div className="bg-[#1a1c3a] border-4 border-[#e8c030] rounded-2xl px-8 py-5 inline-block
                          shadow-[0_0_30px_#e8c03033]">
            <span className="text-[#e8c030] text-5xl font-black tracking-[0.5em]">
              {roomCode}
            </span>
          </div>
        </div>

        {/* Player slots */}
        <div className="bg-[#1a1c3a] border-4 border-[#2e3060] rounded-2xl p-6">
          <p className="text-[#9090b0] text-xs font-black tracking-widest uppercase mb-5">
            Players — {players.length} / 4
          </p>

          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => {
              const player = players[i]
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
                    player ? 'border-[#2e3060] bg-[#10122a]' : 'border-dashed border-[#222440] opacity-40'
                  }`}
                >
                  {player
                    ? <Crewmate color={player.color} size={36} />
                    : <div className="w-9 h-9 rounded-full bg-[#1a1c3a] border-2 border-dashed border-[#2e3060]" />}
                  <div className="text-left min-w-0">
                    <p className="text-white font-black text-sm truncate">
                      {player ? player.name : 'Waiting...'}
                    </p>
                    {player && (
                      <p className="text-[#1d8c3a] text-xs font-bold uppercase tracking-wide">Ready</p>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>

        <motion.p
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-[#9090b0] text-xs font-bold tracking-widest uppercase"
        >
          Waiting for all players...
        </motion.p>

        {/* Start Game — host only */}
        {isHost && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.95 }}
            disabled={!canStart}
            onClick={() => roomCode && emitStartGame(roomCode)}
            className={`w-full py-4 rounded-2xl font-black text-lg uppercase tracking-widest
                       border-4 transition-all ${
              canStart
                ? 'bg-[#1d8c3a] border-[#0d5020] text-white shadow-[0_4px_0_#0d5020] hover:bg-[#22a844] hover:shadow-[0_2px_0_#0d5020] hover:translate-y-[2px]'
                : 'bg-[#1a1c3a] border-[#2e3060] text-[#40405a] cursor-not-allowed'
            }`}
          >
            {canStart ? '🚀 Start Game' : `Need ${2 - players.length} more player${2 - players.length === 1 ? '' : 's'}`}
          </motion.button>
        )}
      </div>
    </div>
  )
}
