import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import Crewmate from '../components/Crewmate'
import SplineModel from '../components/SplineModel'
import TypewriterText from '../components/TypewriterText'
import { fadeDown, fadeUp, scaleIn, stagger, fadeScalePresence } from '../lib/anim'

const PLAYER_COLORS = [
  '#c51111', '#1267ab', '#19803a', '#d6e30f',
  '#6b30bc', '#ef7d0e', '#ec54ba', '#71cdd4',
]

const CODING_TOPICS = [
  { label: 'Python OOP', icon: '🐍' },
  { label: 'SQL',        icon: '📊' },
  { label: 'Recursion',  icon: '🔄' },
  { label: 'System design', icon: '⚡' },
]

export default function Login() {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PLAYER_COLORS[0])
  const [topics, setTopics] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [guestId] = useState(() => `coder_${Math.floor(Math.random() * 99)}`)

  const { roomCode } = useGameStore()
  const { createRoom, joinRoom } = useSocket()
  const navigate = useNavigate()
  const location = useLocation()
  const isCreating: boolean = (location.state as any)?.isCreating ?? false
  const passedCode: string  = (location.state as any)?.roomCode ?? roomCode ?? ''

  useEffect(() => {
    const onReady = () => navigate('/lobby')
    const onErr   = (e: Event) => { setError((e as CustomEvent).detail); setLoading(false) }
    window.addEventListener('socket:roomReady', onReady)
    window.addEventListener('socket:error',     onErr)
    return () => {
      window.removeEventListener('socket:roomReady', onReady)
      window.removeEventListener('socket:error',     onErr)
    }
  }, [navigate])

  const toggleTopic = (topic: string) => {
    setTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    )
  }

  const handleReady = () => {
    if (!name.trim()) return
    setLoading(true)
    setError('')
    if (isCreating) {
      createRoom(name.trim(), color, topics)
    } else {
      joinRoom(passedCode, name.trim(), color, topics)
    }
  }

  const handleGuest = () => {
    setName(guestId)
  }

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
      <div className="relative z-10 w-full max-w-xl px-6 py-4 space-y-3 overflow-y-auto max-h-screen">

        {/* ╔═ TITLE ═╗ */}
        <motion.div variants={fadeDown} initial="hidden" animate="show" className="text-left">
          <h1 className="font-pixel text-4xl md:text-5xl text-[#7cffcb]"
            style={{ textShadow: '0 0 8px #7cffcb55' }}>
            <TypewriterText
              text="CODEKILL"
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
            className="font-pixel text-[14px] text-[#7c9fff] mt-2">
            Among Us for coders · devhacks 2025
          </motion.p>
        </motion.div>

        {/* ╔═ FEATURE BULLETS ═╗ */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-1 px-2">
          {[
            'real-time social deduction',
            'personalised AI tasks (OOP, SQL, recursion…)',
            'post-game claude report',
          ].map((txt, i) => (
            <motion.p key={i} variants={fadeUp}
              className="font-pixel text-[12px] text-[#aab0d0] flex items-start gap-2">
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.7 }}
                className="text-[#7c5cfc] text-[11px] mt-0.5">◆</motion.span> {txt}
            </motion.p>
          ))}
        </motion.div>

        {/* ╔═ AUTH SECTION ═╗ */}
        <motion.div variants={scaleIn} initial="hidden" animate="show"
          className="bg-[#0b0b20ee] bg-grid p-4 space-y-3"
          style={{ border: '2px solid #3a2a6a', boxShadow: '0 0 10px #7c5cfc22' }}>

          <p className="font-pixel text-[13px] text-[#6655aa] flex items-center gap-1.5">
            <span className="text-[8px]">▸</span> supabase auth mock
          </p>

          {/* Sign in with GitHub */}
          <motion.button
            whileHover={{ scale: 1.02, boxShadow: '0 4px 0 #166b2a, 0 0 18px #22a84455' }}
            whileTap={{ scale: 0.97, y: 2 }}
            className="w-full bg-[#22a844] hover:bg-[#2bc853] transition-all
                             text-white font-pixel text-[14px] py-3 tracking-wider
                             border-b-[3px] border-b-[#166b2a] hover:border-b-[2px]"
            style={{ boxShadow: '0 4px 0 #166b2a' }}>
            sign in with github
          </motion.button>

          {/* Guest */}
          <motion.button onClick={handleGuest}
            whileHover={{ scale: 1.01, boxShadow: '0 0 14px #7c5cfc44' }}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-[#14142e] transition-all text-[#c0c8ff] font-pixel text-[14px] py-3 tracking-wider"
            style={{ border: '2px solid #4a3a8a', boxShadow: '0 0 10px #7c5cfc22' }}>
            guest · {guestId}
          </motion.button>

          {/* Name input (shown after guest/github) */}
          <AnimatePresence>
            {name && (
              <motion.div {...fadeScalePresence} className="pt-1">
                <label className="font-pixel text-[11px] text-[#555577] block mb-1.5">DISPLAY NAME</label>
                <input
                  className="w-full bg-[#14142e] border-2 border-[#2a2a4a] text-white font-pixel text-[14px]
                             px-3 py-2.5 focus:outline-none focus:border-[#7c5cfc] transition-colors"
                  placeholder="Enter name..."
                  maxLength={16}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ╔═ CREWMATE PREVIEW (small, inline) ═╗ */}
        <AnimatePresence>
          {name && (
            <motion.div {...fadeScalePresence} className="flex items-center gap-3 px-2">
              <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
                <Crewmate color={color} size={40} />
              </motion.div>
              <motion.div variants={stagger} initial="hidden" animate="show" className="flex gap-1.5 flex-wrap">
                {PLAYER_COLORS.map((c) => (
                  <motion.button key={c} onClick={() => setColor(c)}
                    variants={fadeUp}
                    whileHover={{ scale: 1.3, y: -2 }}
                    whileTap={{ scale: 0.85 }}
                    className="w-5 h-5 transition-all"
                    style={{
                      background: c,
                      outline: color === c ? '2px solid #e8c030' : '2px solid transparent',
                      outlineOffset: '1px',
                    }}
                  />
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ╔═ TOPIC PICKER ═╗ */}
        <motion.div variants={scaleIn} initial="hidden" animate="show"
          className="bg-[#0b0b20ee] bg-grid p-4 space-y-3"
          style={{ border: '2px solid #3a2a5a', boxShadow: '0 0 8px #7c5cfc18' }}>

          <p className="font-pixel text-[14px] text-[#c0c8ff] text-left">
            <span style={{ color: '#e8c030' }}>✦</span> pick your topics
            <span style={{ color: '#e8c030' }}> ✦</span>
          </p>

          <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-2">
            {CODING_TOPICS.map(({ label, icon }) => {
              const active = topics.includes(label)
              return (
                <motion.button key={label} onClick={() => toggleTopic(label)}
                  variants={fadeUp}
                  whileHover={{ scale: 1.03, boxShadow: active ? '0 0 14px #22a84444' : '0 0 10px #7c5cfc33' }}
                  whileTap={{ scale: 0.95 }}
                  className={`flex items-center gap-2 px-3 py-2 transition-all text-left
                    ${active
                      ? 'bg-[#1a2e1a] border-2 border-[#22a844]'
                      : 'bg-[#14142e] border-2 border-[#2a2a4a] hover:border-[#444466]'
                    }`}>
                  <input type="checkbox" checked={active} readOnly className="retro-check" />
                  <motion.span
                    animate={active ? { rotate: [0, 10, -10, 0] } : {}}
                    transition={{ duration: 0.5 }}
                    className="text-[14px]">{icon}</motion.span>
                  <span className={`font-pixel text-[12px] ${active ? 'text-white' : 'text-[#7070a0]'}`}>
                    {label}
                  </span>
                </motion.button>
              )
            })}
          </motion.div>
        </motion.div>

        {/* ╔═ ERROR ═╗ */}
        <AnimatePresence>
          {error && (
            <motion.p key="err"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="font-pixel text-[8px] text-[#ff4466] text-center bg-[#ff446611]
                          border-2 border-[#ff4466] px-3 py-2">
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* ╔═ READY BUTTON ═╗ */}
        <motion.button
          variants={fadeUp} initial="hidden" animate="show"
          whileHover={name.trim() && !loading ? { scale: 1.02, boxShadow: '0 4px 0 #166b2a, 0 0 22px #22a84466' } : {}}
          whileTap={name.trim() && !loading ? { scale: 0.97, y: 2 } : {}}
          onClick={handleReady} disabled={!name.trim() || loading}
          className="w-full bg-[#22a844] hover:bg-[#2bc853] transition-all
                     text-white font-pixel text-[15px] py-3.5 tracking-wider
                     border-b-[3px] border-b-[#166b2a] hover:border-b-[2px]
                     disabled:opacity-30 disabled:cursor-not-allowed disabled:border-b-0"
          style={{ boxShadow: '0 4px 0 #166b2a' }}>
          {loading ? 'connecting...' : isCreating ? 'create room' : 'ready up'}
        </motion.button>
      </div>
    </div>
  )
}
