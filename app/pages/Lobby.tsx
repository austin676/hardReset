import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import Crewmate from '../components/Crewmate'

export default function Lobby() {
  const { roomCode, players, myPlayerId } = useGameStore()
  const { emitStartGame } = useSocket()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  const isHost = players.length > 0 && players[0]?.id === myPlayerId
  const canStart = players.length >= 2

  // Navigate to game screen when game starts
  useEffect(() => {
    const onGameStarted = () => navigate('/game')
    window.addEventListener('socket:gameStarted', onGameStarted)
    return () => window.removeEventListener('socket:gameStarted', onGameStarted)
  }, [navigate])

  const handleCopy = () => {
    if (!roomCode) return
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-[#10122a] flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-6">
        {/* Room code + copy button side by side */}
        <div className="flex items-center justify-center gap-4">
          <div className="bg-[#1a1c3a] border-4 border-[#e8c030] rounded-2xl px-10 py-6
                          shadow-[0_0_30px_#e8c03033]">
            <p className="text-[#9090b0] text-[10px] font-black tracking-widest uppercase mb-1">Room Code</p>
            <span className="text-[#e8c030] text-6xl font-black tracking-[0.6em] select-all">
              {roomCode}
            </span>
          </div>
          <button
            onClick={handleCopy}
            className="shrink-0 px-5 py-4 rounded-2xl font-black text-sm uppercase tracking-widest
                       transition-all active:scale-95
                       bg-[#e8c030] text-[#10122a] hover:bg-[#f0d060]
                       shadow-[0_4px_0_#a08010] hover:shadow-[0_2px_0_#a08010] hover:translate-y-0.5"
            title="Copy room code"
          >
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                  className="flex flex-col items-center gap-1">
                  <span className="text-lg">✓</span>
                  <span>Copied</span>
                </motion.span>
              ) : (
                <motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                  className="flex flex-col items-center gap-1">
                  <span className="text-lg">📋</span>
                  <span>Copy</span>
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Player slots — uniform cards */}
        <div className="bg-[#1a1c3a] border-4 border-[#2e3060] rounded-2xl p-8">
          <p className="text-[#9090b0] text-xs font-black tracking-widest uppercase mb-5">
            Players — {players.length} / 4
          </p>

          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => {
              const player = players[i]
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-4 px-5 py-5 rounded-2xl border-2 border-[#2e3060] bg-[#10122a] h-24"
                >
                  {player
                    ? <Crewmate color={player.color} size={48} />
                    : <div className="w-12 h-12 rounded-full bg-[#1a1c3a] border-2 border-dashed border-[#2e3060] shrink-0" />}
                  <div className="text-left min-w-0">
                    <p className={`font-black text-base truncate ${player ? 'text-white' : 'text-[#40405a]'}`}>
                      {player ? player.name : 'Waiting...'}
                    </p>
                    <p className={`text-xs font-bold uppercase tracking-wide ${player ? 'text-[#1d8c3a]' : 'text-[#2e3060]'}`}>
                      {player ? 'Ready' : 'Empty slot'}
                    </p>
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
                ? 'bg-[#1d8c3a] border-[#0d5020] text-white shadow-[0_4px_0_#0d5020] hover:bg-[#22a844] hover:shadow-[0_2px_0_#0d5020] hover:translate-y-0.5'
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