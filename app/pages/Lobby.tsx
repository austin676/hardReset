import { motion } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import Crewmate from '../components/Crewmate'

export default function Lobby() {
  const { roomCode, players } = useGameStore()
  useSocket()

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
      </div>
    </div>
  )
}
