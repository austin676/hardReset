import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

  const isHost = players.length > 0 && players[0]?.id === myPlayerId
  const canStart = players.length >= 2

  const startBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (canStart) return startNeonPulse(startBtnRef.current, '#22a844')
  }, [canStart])

  useEffect(() => {
    const onGameStarted = () => navigate('/playing')
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
          <AnimatePresence>
            {isHost && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                className="font-pixel text-[11px] bg-[#7c5cfc] text-white px-2 py-1">host: you</motion.span>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ╔═ PLAYER GRID ═╗ */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => {
            const player = players[i]
            const isMe = player?.id === myPlayerId
            return (
              <motion.div
                key={i}
                variants={scaleIn}
                whileHover={player ? { scale: 1.03, boxShadow: '0 0 20px #7c5cfc33' } : {}}
                layout
                className={`bg-[#0b0b20dd] p-4 flex flex-col items-center gap-2 transition-colors ${
                  !player ? 'opacity-25' : ''
                }`}
                style={player ? { border: '2px solid #3a2a6a', boxShadow: '0 0 14px #7c5cfc22' } : { border: '2px dashed #2a2a3a' }}
              >
                {player ? (
                  <>
                    <motion.div
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}>
                      <Crewmate color={player.color} size={44} />
                    </motion.div>
                    <p className="font-pixel text-[14px] truncate max-w-full"
                      style={isMe ? { color: '#7cffcb', textShadow: '0 0 8px #7cffcb, 0 0 20px #7cffcb44' } : { color: '#fff' }}>
                      {isMe ? 'you' : player.name}
                    </p>
                    <p className="font-pixel text-[11px] text-[#7070a0]">
                      topics: {player.topics?.join(', ') || 'none'}
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

        {/* ╔═ START GAME (host only) ═╗ */}
        <AnimatePresence>
          {isHost && (
            <motion.button
              ref={startBtnRef}
              key="start-btn"
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{ opacity: 0, y: 8,   scale: 0.95 }}
              whileHover={canStart ? { scale: 1.03 } : {}}
              whileTap={canStart ? { scale: 0.96, y: 2 } : {}}
              disabled={!canStart}
              onClick={() => roomCode && emitStartGame(roomCode)}
              className={`w-full font-pixel text-[15px] py-3.5 tracking-wider transition-all ${
                canStart
                  ? 'bg-[#22a844] text-white border-b-[3px] border-b-[#166b2a] hover:bg-[#2bc853] hover:border-b-[2px]'
                  : 'bg-[#14142e] text-[#333355] border-2 border-[#2a2a4a] cursor-not-allowed'
              }`}
              style={canStart ? { boxShadow: '0 4px 0 #166b2a' } : {}}
            >
              {canStart ? '▶ start game' : `need ${2 - players.length} more`}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
