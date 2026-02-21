import { motion } from 'framer-motion'
import { useNavigate } from 'react-router'
import { useGameStore } from '../store/gameStore'
import Crewmate from './Crewmate'

export default function EndScreen() {
  const { winner, players, myRole, reset } = useGameStore()
  const navigate = useNavigate()

  const isWinner =
    (winner === 'coders' && myRole === 'coder') ||
    (winner === 'imposter' && myRole === 'imposter')

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
        className={`rounded-2xl p-8 text-center border-4 ${
          isWinner ? 'bg-[#1d8c3a18] border-[#1d8c3a]' : 'bg-[#e8101018] border-[#e81010]'
        }`}
      >
        <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', delay: 0.2 }} className="text-6xl mb-4">
          {isWinner ? '🏆' : '💨'}
        </motion.div>
        <h2 className={`text-3xl font-black tracking-widest uppercase ${
          isWinner ? 'text-[#1d8c3a]' : 'text-[#e81010]'
        }`}>
          {isWinner ? 'Victory!' : 'Defeat'}
        </h2>
        <p className="text-[#9090b0] font-bold text-sm mt-2 uppercase tracking-widest">
          {winner === 'coders' ? 'Crewmates caught the impostor!' : 'The impostor won!'}
        </p>
      </motion.div>

      <div className="bg-[#1a1c3a] border-4 border-[#2e3060] rounded-2xl p-5">
        <h3 className="text-[#9090b0] font-black text-xs uppercase tracking-widest mb-4">Player Stats</h3>
        <div className="grid grid-cols-2 gap-3">
          {players.map((player, i) => (
            <motion.div key={player.id}
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-3 p-3 bg-[#10122a] rounded-xl border-2 border-[#2e3060]"
            >
              <Crewmate color={player.color} size={40} dead={!player.isAlive} />
              <div className="min-w-0">
                <p className="text-white font-black text-sm truncate">{player.name}</p>
                <p className="text-[#9090b0] text-xs font-bold">{player.tasksCompleted} tasks</p>
                {!player.isAlive && <p className="text-[#e81010] text-xs font-black uppercase">Ejected</p>}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <button onClick={() => { reset(); navigate('/') }}
        className="w-full bg-[#1a3a8c] hover:bg-[#2040aa] active:scale-95 transition-all
                   text-white font-black text-lg py-4 rounded-xl tracking-widest uppercase
                   shadow-[0_4px_0_#0a1a50] hover:shadow-[0_2px_0_#0a1a50] hover:translate-y-[2px]"
      >
        Play Again
      </button>
    </div>
  )
}
