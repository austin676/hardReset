import { motion } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'

const ABILITIES = [
  { id: 'timeBomb',   label: 'Time Bomb',   cost: 3, icon: '💣', description: 'Freeze 15s'  },
  { id: 'langSwitch', label: 'Lang Switch', cost: 2, icon: '🔄', description: 'Change lang' },
  { id: 'sabotage',   label: 'Sabotage',    cost: 4, icon: '⚡',    description: 'Close 30s'  },
  { id: 'fakeTask',   label: 'Fake Task',   cost: 0, icon: '🎭', description: 'Fake it'    },
]

export default function AbilityBar() {
  const { abilityPoints, myRole, gamePhase } = useGameStore()
  const { socket } = useSocket()

  if (myRole !== 'imposter' || gamePhase !== 'playing') return null

  const useAbility = (id: string, cost: number) => {
    if (abilityPoints < cost) return
    socket.emit('useAbility', { abilityId: id })
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#10122a] border-t-4 border-[#e81010]
                    px-4 py-3 shadow-[0_-4px_20px_#e8101022]">
      <div className="flex items-center gap-3 max-w-xl mx-auto">
        {/* Points */}
        <div className="flex flex-col items-center mr-2">
          <span className="text-[#e81010] font-black text-xl">{abilityPoints}</span>
          <span className="text-[#9090b0] font-black text-xs uppercase">pts</span>
        </div>

        {ABILITIES.map((a) => {
          const canAfford = abilityPoints >= a.cost
          return (
            <motion.button key={a.id}
              whileTap={canAfford ? { scale: 0.92 } : {}}
              onClick={() => useAbility(a.id, a.cost)}
              disabled={!canAfford}
              title={a.description}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-xl border-2
                          font-black text-xs uppercase transition-all
                          ${ canAfford
                            ? 'border-[#e81010] bg-[#e8101015] text-white hover:bg-[#e8101025] cursor-pointer'
                            : 'border-[#2e3060] text-[#40405a] cursor-not-allowed opacity-50' }`}
            >
              <span className="text-xl">{a.icon}</span>
              <span className="tracking-wide">{a.label}</span>
              <span className={a.cost === 0 ? 'text-[#1d8c3a]' : 'text-[#e81010]'}>
                {a.cost === 0 ? 'Free' : `${a.cost}pts`}
              </span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
