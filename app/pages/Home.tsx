import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router'
import { useGameStore } from '../store/gameStore'
import SplineModel from '../components/SplineModel'
import TypewriterText from '../components/TypewriterText'
import { fadeDown, fadeUp, scaleIn, stagger } from '../lib/anim'

/* ── Fake room list for the "Find Room" panel ─────────── */
const MOCK_ROOMS = [
  { code: 'BLD3', players: 2, max: 4, status: 'join' as const },
  { code: 'X7P9', players: 4, max: 4, status: 'full' as const },
  { code: 'M4TR', players: 1, max: 4, status: 'join' as const },
]

export default function Home() {
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const { setRoomCode: storeSetRoomCode } = useGameStore()
  const navigate = useNavigate()

  const handleJoin = (code?: string) => {
    const c = (code ?? roomCode).trim().toUpperCase()
    if (c.length < 4) { setError('Room code too short'); return }
    storeSetRoomCode(c)
    navigate('/login', { state: { isCreating: false, roomCode: c } })
  }

  const handleCreate = () => {
    navigate('/login', { state: { isCreating: true } })
  }

  return (
    <div className="min-h-screen bg-[#0b0b1a] scanlines relative flex items-center justify-center overflow-hidden">

      {/* ── 3D background ── */}
      <div className="absolute inset-0" style={{ mixBlendMode: 'screen', zIndex: 0 }}>
        <SplineModel className="w-full h-full" />
      </div>
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 100% at 28% 50%, #0b0b1aee 0%, #0b0b1acc 50%, transparent 100%)', zIndex: 1 }} />
      {/* Scan sweep line */}
      <div className="scan-sweep" style={{ zIndex: 2 }} />

      {/* ── Content ── */}
      <div className="relative z-10 w-full max-w-xl px-6 py-4 space-y-3 overflow-y-auto max-h-screen scrollbar-thin">

        {/* ╔═ TITLE BLOCK ═╗ */}
        <motion.div variants={fadeDown} initial="hidden" animate="show" className="text-left">
          <h1 className="font-pixel text-4xl md:text-5xl text-[#7cffcb] leading-tight"
            style={{ textShadow: '0 0 8px #7cffcb55' }}>
            <TypewriterText
              text="hardReset"
              typeSpeed={130}
              deleteSpeed={70}
              pauseFull={2200}
              pauseEmpty={450}
            />
          </h1>
          <motion.p
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55, duration: 0.8 }}
            className="font-pixel text-[14px] text-[#7c9fff] mt-2 leading-relaxed">
            Among Us for coders · CODEKILL
          </motion.p>
        </motion.div>

        {/* ╔═ FEATURE BULLETS ═╗ */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-1">
          {[
            'Real-time social deduction',
            'Personalised AI tasks (OOP, SQL, recursion…)',
            'Post-game AI report',
          ].map((txt, i) => (
            <motion.p key={i} variants={fadeUp}
              className="font-pixel text-[13px] text-[#c0c8ff] flex items-start gap-2">
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.7 }}
                className="text-[12px] mt-0.5" style={{ color: '#a78bff' }}>◆</motion.span>
              {txt}
            </motion.p>
          ))}
        </motion.div>

        {/* ╔═ FIND ROOM ═╗ */}
        <motion.div variants={scaleIn} initial="hidden" animate="show"
          className="bg-[#0b0b20ee] bg-grid p-3 space-y-2.5"
          style={{ border: '2px solid #3a2a6a', boxShadow: '0 0 10px #7c5cfc22' }}>

          <p className="font-pixel text-[14px] text-[#e8c030] flex items-center gap-2">
            <span>🔍</span> FIND ROOM
          </p>

          {/* Code input + Join button */}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-[#0d0d22] text-white font-pixel text-sm
                         text-center tracking-[0.3em] uppercase px-3 py-2.5
                         focus:outline-none transition-all
                         placeholder:text-[#2a2a4a] placeholder:tracking-normal placeholder:text-[10px]"
              style={{ border: '2px solid #3a2a6a', boxShadow: '0 0 4px #7c5cfc11' }}
              onFocus={e => (e.currentTarget.style.boxShadow = '0 0 8px #7c5cfc55')}
              onBlur={e => (e.currentTarget.style.boxShadow = '0 0 4px #7c5cfc11')}
              maxLength={6}
              placeholder="K1LL"
              value={roomCode}
              onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <motion.button onClick={() => handleJoin()}
              whileHover={{ scale: 1.06, boxShadow: '0 4px 0 #166b2a, 0 0 16px #22a84455' }}
              whileTap={{ scale: 0.94, y: 2 }}
              className="bg-[#22a844] hover:bg-[#2bc853] transition-all
                         text-white font-pixel text-[13px] px-6 py-2.5 tracking-wider whitespace-nowrap
                         border-b-[3px] border-b-[#166b2a] hover:border-b-[2px]"
              style={{ boxShadow: '0 4px 0 #166b2a' }}>
              JOIN
            </motion.button>
          </div>
          <AnimatePresence>
            {error && (
              <motion.p key="err"
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="font-pixel text-[12px] text-[#ff4466]">
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Room list */}
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2">
            {MOCK_ROOMS.map((room) => (
              <motion.div key={room.code} variants={fadeUp}
                whileHover={{ x: 3, boxShadow: room.status === 'full' ? '0 0 12px #e8c03044' : '0 0 12px #22a84444' }}
                className="flex items-center justify-between bg-[#0d0d22] border-l-[3px] px-3 py-2 transition-colors"
                style={{
                  borderLeftColor: room.status === 'full' ? '#e8c030' : '#22a844',
                  boxShadow: room.status === 'full' ? '0 0 8px #e8c03022' : '0 0 8px #22a84422',
                }}>
                <div className="flex items-center gap-3">
                  <span className="font-pixel text-[14px] text-[#22a844]">{room.code}</span>
                  <span className="font-pixel text-[12px] text-[#555577]">{room.players}/{room.max}</span>
                </div>
                <motion.button
                  whileHover={room.status !== 'full' ? { scale: 1.08 } : {}}
                  whileTap={room.status !== 'full' ? { scale: 0.92 } : {}}
                  disabled={room.status === 'full'}
                  onClick={() => handleJoin(room.code)}
                  className={`font-pixel text-[12px] px-3 py-1.5 transition-all ${
                    room.status === 'full'
                      ? 'bg-[#2a2a4a] text-[#555577] cursor-not-allowed'
                      : 'bg-[#22a844] text-white hover:bg-[#2bc853] active:translate-y-[1px] border-b-2 border-b-[#166b2a]'
                  }`}>
                  {room.status === 'full' ? 'full' : 'join'}
                </motion.button>
              </motion.div>
            ))}
          </motion.div>

          {/* Create new room */}
          <motion.button onClick={handleCreate}
            whileHover={{ scale: 1.02, boxShadow: '0 4px 0 #4a35a0, 0 0 20px #7c5cfc44' }}
            whileTap={{ scale: 0.97, y: 2 }}
            className="w-full bg-[#6c4fcf] hover:bg-[#7c5cfc] transition-all
                       text-white font-pixel text-[14px] py-3 tracking-wider
                       border-b-[3px] border-b-[#4a35a0] hover:border-b-[2px]"
            style={{ boxShadow: '0 4px 0 #4a35a0' }}>
            + CREATE NEW ROOM
          </motion.button>
        </motion.div>

        {/* Footer */}
        <p className="font-pixel text-[11px] text-[#333355] text-center tracking-wider">
          N PLAYERS · 3 ROUNDS · 1 IMPOSTOR
        </p>
      </div>
    </div>
  )
}
