import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import ActivityLog from './ActivityLog'

export default function MeetingPopup() {
  const { activityLog, players } = useGameStore()
  const [logOpen, setLogOpen] = useState(false)

  return (
    <div className="bg-[#10122a] border-b-4 border-[#e8c030] flex-shrink-0
                    shadow-[0_4px_20px_#e8c03022]">
      <div className="flex items-center gap-4 px-5 py-3">
        {/* Siren */}
        <motion.span
          animate={{ scale: [1, 1.3, 1], rotate: [-10, 10, -10] }}
          transition={{ repeat: Infinity, duration: 0.8 }}
          className="text-2xl flex-shrink-0"
        >
          🚨
        </motion.span>

        <div>
          <h2 className="text-[#e8c030] font-black text-lg tracking-widest uppercase
                         drop-shadow-[0_0_8px_#e8c03066]">
            Emergency Meeting
          </h2>
          <p className="text-[#9090b0] text-xs font-bold tracking-widest uppercase">Discuss and vote out the impostor</p>
        </div>

        {/* Player chips */}
        <div className="flex items-center gap-2 ml-4 flex-wrap">
          {players.map((p) => (
            <div key={p.id} title={p.name}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 text-xs font-black uppercase tracking-wide
                          ${ p.isAlive
                            ? 'border-[#2e3060] bg-[#1a1c3a] text-white'
                            : 'border-[#e8103022] bg-[#e8100a11] text-[#e85050] line-through opacity-50' }`}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </div>
          ))}
        </div>

        {/* Log toggle */}
        <button onClick={() => setLogOpen((o) => !o)}
          className="ml-auto text-xs font-black tracking-widest uppercase text-[#9090b0]
                     border-2 border-[#2e3060] px-3 py-1.5 rounded-lg
                     hover:border-[#e8c030] hover:text-[#e8c030] transition-all"
        >
          {logOpen ? 'Hide Log ▲' : 'View Log ▼'}
        </button>
      </div>

      <AnimatePresence>
        {logOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden px-5 pb-4"
          >
            <ActivityLog entries={activityLog} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
