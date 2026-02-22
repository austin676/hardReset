import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router'
import { useGameStore } from '../store/gameStore'
import Crewmate from '../components/Crewmate'

const DECO_MATES = [
  { color: '#c51111', x: '8%',  y: '20%', size: 56, rotate: -15 },
  { color: '#1267ab', x: '88%', y: '15%', size: 48, rotate: 12  },
  { color: '#19803a', x: '5%',  y: '72%', size: 52, rotate: 8   },
  { color: '#d6e30f', x: '85%', y: '70%', size: 44, rotate: -10 },
  { color: '#6b30bc', x: '50%', y: '88%', size: 40, rotate: 5   },
]

export default function Home() {
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const { setRoomCode: storeSetRoomCode } = useGameStore()
  const navigate = useNavigate()

  const handleJoin = () => {
    const code = roomCode.trim().toUpperCase()
    if (code.length !== 6) { setError('Room code must be 6 characters'); return }
    storeSetRoomCode(code)
    navigate('/login', { state: { isCreating: false, roomCode: code } })
  }

  const handleCreate = () => {
    navigate('/login', { state: { isCreating: true } })
  }

  return (
    <div className="min-h-screen bg-[#10122a] flex items-center justify-center px-4 overflow-hidden relative">
      {/* Decorative crewmates */}
      {DECO_MATES.map((m, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{ left: m.x, top: m.y }}
          animate={{ y: [0, -12, 0], rotate: [m.rotate, m.rotate + 4, m.rotate] }}
          transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Crewmate color={m.color} size={m.size} />
        </motion.div>
      ))}

      <div className="text-center max-w-sm w-full relative z-10">
        {/* Title */}
        <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <h1 className="text-5xl font-black text-white mb-1 tracking-widest uppercase
                         drop-shadow-[0_4px_16px_#00000088]">
            CODE KILL
          </h1>
          <p className="text-[#c0c0e0] text-sm font-bold tracking-widest uppercase mb-8">
            Among Us × Competitive Coding
          </p>
        </motion.div>

        {/* Panel */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 }}
          className="bg-[#1a1c3a] rounded-2xl p-6 space-y-4
                     border-4 border-[#2e3060] shadow-[0_8px_40px_#00000066]"
        >
          <p className="text-[#9090b0] text-xs font-black tracking-widest uppercase">Enter Room Code</p>
          <input
            className="w-full bg-[#10122a] border-2 border-[#2e3060] text-white text-center
                       text-3xl tracking-[0.6em] font-black uppercase rounded-xl px-4 py-4
                       focus:outline-none focus:border-[#e8c030] transition-all
                       placeholder:text-[#2e3060] placeholder:tracking-normal"
            maxLength={6}
            placeholder="ABC123"
            value={roomCode}
            onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          {error && <p className="text-[#e81010] text-xs font-bold tracking-wide">{error}</p>}

          <button onClick={handleJoin}
            className="w-full bg-[#1d8c3a] hover:bg-[#22a844] active:scale-95 transition-all
                       text-white font-black text-lg py-4 rounded-xl tracking-widest uppercase
                       shadow-[0_4px_0_#0d5020] hover:shadow-[0_2px_0_#0d5020] hover:translate-y-0.5"
          >
            Join Room
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t-2 border-[#2e3060]" />
            <span className="text-[#5050708] text-xs font-black tracking-widest">OR</span>
            <div className="flex-1 border-t-2 border-[#2e3060]" />
          </div>

          <button onClick={handleCreate}
            className="w-full bg-[#1a3a8c] hover:bg-[#2040aa] active:scale-95 transition-all
                       text-white font-black text-lg py-4 rounded-xl tracking-widest uppercase
                       shadow-[0_4px_0_#0a1a50] hover:shadow-[0_2px_0_#0a1a50] hover:translate-y-0.5"
          >
            Create Room
          </button>
        </motion.div>

        <p className="text-[#40405a] text-xs font-bold tracking-widest uppercase mt-6">
          4 Players · 3 Rounds · 1 Impostor
        </p>
      </div>
    </div>
  )
}
