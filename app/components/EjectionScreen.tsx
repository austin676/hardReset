import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useGameStore } from '../store/gameStore'
import Crewmate from './Crewmate'

export default function EjectionScreen() {
  const { ejectedPlayer, wasImposter, gamePhase, setGamePhase } = useGameStore()
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => {
      if (gamePhase === 'results') navigate('/results')
      else setGamePhase('playing')
    }, 6000)
    return () => clearTimeout(timer)
  }, [gamePhase])

  if (!ejectedPlayer) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-[#06070f] flex flex-col items-center justify-center z-50"
    >
      {/* Stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} className="absolute w-1 h-1 bg-white rounded-full opacity-40"
            style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
                     animationDelay: `${Math.random() * 3}s` }} />
        ))}
      </div>

      {/* Crewmate floating to space */}
      <motion.div
        initial={{ y: 80, scale: 1, opacity: 1, rotate: 0 }}
        animate={{ y: -400, scale: 0.2, opacity: 0, rotate: 720 }}
        transition={{ duration: 4, delay: 1, ease: 'easeIn' }}
        className="mb-16"
      >
        <Crewmate color={ejectedPlayer.color} size={96} dead={true} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="text-center space-y-4"
      >
        <h2 className="text-white text-4xl font-black tracking-wider uppercase">
          {ejectedPlayer.name} was ejected.
        </h2>

        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
          className={`text-2xl font-black tracking-wide uppercase ${
            wasImposter ? 'text-[#1d8c3a]' : 'text-[#e81010]'
          }`}
        >
          {wasImposter
            ? `${ejectedPlayer.name} was The Impostor.`
            : `${ejectedPlayer.name} was NOT The Impostor.`}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5 }}
          className="flex items-center justify-center gap-2 mt-4"
        >
          {[...Array(3)].map((_, i) => (
            <motion.div key={i} className="w-2 h-2 rounded-full bg-[#9090b0]"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.3 }} />
          ))}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
