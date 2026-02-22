import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import Crewmate from '../components/Crewmate'
import SplineModel from '../components/SplineModel'
import { fadeDown, fadeUp, scaleIn, stagger, startNeonPulse } from '../lib/anim'

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

  return (
    <div className="min-h-screen bg-[#0b0b1a] scanlines relative flex items-center justify-center overflow-hidden">

      {/* ── 3D background ── */}
      <div className="absolute inset-0" style={{ mixBlendMode: 'screen', zIndex: 0 }}>
        <SplineModel className="w-full h-full" />
      </div>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 100% at 28% 50%, #0b0b1aee 0%, #0b0b1acc 50%, transparent 100%)', zIndex: 1 }} />
      <div className="scan-sweep" style={{ zIndex: 2 }} />

      {/* ── Content ── */}
      <div className="relative z-10 w-full max-w-md px-6 py-6 space-y-4 overflow-y-auto max-h-screen">

        {/* ╔═ LOBBY HEADER ═╗ */}
        <motion.div variants={fadeDown} initial="hidden" animate="show"
          className="bg-[#0b0b20ee] bg-grid p-4 flex items-center justify-between"
          style={{ border: '2px solid #3a2a6a', boxShadow: '0 0 10px #7c5cfc22' }}>
          <div className="flex items-center gap-2">
            <span className="font-pixel text-[15px] text-[#8888cc] uppercase">Lobby ·</span>
            <motion.span
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className="font-pixel text-[17px] text-[#e8c030] neon-flicker">{roomCode}</motion.span>
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
                  </>
                ) : (
                  <>
                    <motion.div
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.5 }}
                      className="w-11 h-11 border-2 border-dashed border-[#2a2a4a]" />
                    <p className="font-pixel text-[12px] text-[#333355]">waiting...</p>
                  </>
                )}
              </motion.div>
            )
          })}
        </motion.div>

        {/* ╔═ WAITING PULSE ═╗ */}
        <motion.p
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          className="font-pixel text-[12px] text-[#555577] text-center tracking-wider"
        >
          waiting for players… {players.length}/4
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
