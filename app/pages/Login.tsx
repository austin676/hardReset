import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import Crewmate from '../components/Crewmate'

const PLAYER_COLORS = [
  '#c51111', '#1267ab', '#19803a', '#d6e30f',
  '#6b30bc', '#ef7d0e', '#ec54ba', '#71cdd4',
]

const CODING_TOPICS = [
  'Arrays', 'Strings', 'Recursion', 'Trees',
  'Dynamic Programming', 'Graphs', 'Sorting', 'TypeScript',
]

export default function Login() {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PLAYER_COLORS[0])
  const [topics, setTopics] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { roomCode } = useGameStore()
  const { createRoom, joinRoom } = useSocket()
  const navigate = useNavigate()
  const location = useLocation()
  const isCreating: boolean = (location.state as any)?.isCreating ?? false
  const passedCode: string  = (location.state as any)?.roomCode ?? roomCode ?? ''

  // Navigate to lobby once socket confirms room ready
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

  return (
    <div className="min-h-screen bg-[#10122a] flex items-center justify-center px-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full bg-[#1a1c3a] rounded-2xl p-7 space-y-6
                   border-4 border-[#2e3060] shadow-[0_8px_40px_#00000066]"
      >
        {/* Room badge */}
        <div className="text-center">
          <p className="text-[#9090b0] text-xs font-black tracking-widest uppercase">
            {isCreating ? 'Creating New Room' : 'Joining Room'}
          </p>
          {!isCreating && (
            <h2 className="text-4xl font-black text-[#e8c030] tracking-widest">{passedCode}</h2>
          )}
        </div>

        {/* Crewmate preview */}
        <div className="flex justify-center">
          <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
            <Crewmate color={color} size={72} />
          </motion.div>
        </div>

        {/* Name */}
        <div>
          <label className="text-[#9090b0] text-xs font-black tracking-widest uppercase mb-2 block">Display Name</label>
          <input
            className="w-full bg-[#10122a] border-2 border-[#2e3060] text-white rounded-xl
                       px-4 py-3 font-bold text-lg focus:outline-none focus:border-[#e8c030] transition-all"
            placeholder="Enter your name..."
            maxLength={16}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Color picker */}
        <div>
          <label className="text-[#9090b0] text-xs font-black tracking-widest uppercase mb-3 block">Player Color</label>
          <div className="flex gap-3 flex-wrap">
            {PLAYER_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className="transition-all active:scale-90 rounded-full p-0.5"
                style={{ border: color === c ? `3px solid #e8c030` : '3px solid transparent' }}
              >
                <Crewmate color={c} size={36} />
              </button>
            ))}
          </div>
        </div>

        {/* Topics */}
        <div>
          <label className="text-[#9090b0] text-xs font-black tracking-widest uppercase mb-3 block">
            Coding Topics
          </label>
          <div className="flex flex-wrap gap-2">
            {CODING_TOPICS.map((topic) => (
              <button key={topic} onClick={() => toggleTopic(topic)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wide border-2 transition-all uppercase ${
                  topics.includes(topic)
                    ? 'bg-[#1d8c3a] border-[#22a844] text-white'
                    : 'bg-transparent border-[#2e3060] text-[#7070a0] hover:border-[#4050a0]'
                }`}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-[#e81010] text-xs font-black tracking-wide text-center bg-[#e8101011]
                        border-2 border-[#e81010] rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        <button onClick={handleReady} disabled={!name.trim() || loading}
          className="w-full bg-[#1d8c3a] hover:bg-[#22a844] active:scale-95 transition-all
                     text-white font-black text-lg py-4 rounded-xl tracking-widest uppercase
                     shadow-[0_4px_0_#0d5020] hover:shadow-[0_2px_0_#0d5020] hover:translate-y-0.5
                     disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {loading ? 'Connecting...' : isCreating ? 'Create Room!' : 'Ready Up!'}
        </button>
      </motion.div>
    </div>
  )
}