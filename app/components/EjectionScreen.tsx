import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useGameStore } from '../store/gameStore'
import Crewmate from './Crewmate'

export default function EjectionScreen() {
  const {
    ejectedPlayer, wasImposter, gamePhase, setGamePhase,
    setMeetingResults, setMeetingCallerName,
  } = useGameStore()
  const navigate = useNavigate()

  // Animation sequence state
  const [showParticles, setShowParticles] = useState(false)
  const [showSpaceship, setShowSpaceship] = useState(false)
  const [showText, setShowText] = useState(false)
  const [showRoleReveal, setShowRoleReveal] = useState(false)

  // Reset animation states when entering ejection phase
  useEffect(() => {
    if (gamePhase === 'ejection') {
      setShowParticles(false)
      setShowSpaceship(false)
      setShowText(false)
      setShowRoleReveal(false)
    }
  }, [gamePhase])

  useEffect(() => {
    if (gamePhase !== 'ejection' || !ejectedPlayer) return

    const sequences = [
      { delay: 200, action: () => setShowParticles(true) },
      { delay: 800, action: () => setShowSpaceship(true) },
      { delay: 1800, action: () => setShowText(true) },
      { delay: 2800, action: () => setShowRoleReveal(true) },
    ]

    const timeouts = sequences.map(seq =>
      setTimeout(seq.action, seq.delay)
    )

    const finalTimeout = setTimeout(() => {
      const { gamePhase: phase } = useGameStore.getState()
      if (phase !== 'ejection') return
      // Clean up meeting state
      setMeetingResults(null)
      setMeetingCallerName(null)
      // Navigate or resume
      if (phase === 'results') {
        navigate('/results')
      } else {
        setGamePhase('playing')
        // Resume Phaser scene
        import('~/game/GameEventBus').then(({ gameEventBus }) => {
          gameEventBus.emit('meeting:end', {})
        })
      }
    }, 6000)

    return () => {
      timeouts.forEach(clearTimeout)
      clearTimeout(finalTimeout)
    }
  }, [gamePhase, ejectedPlayer, navigate, setGamePhase, setMeetingResults, setMeetingCallerName])

  // Only show during ejection phase with an ejected player
  if (gamePhase !== 'ejection' || !ejectedPlayer) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex flex-col items-center justify-center z-100 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #000014 0%, #020418 30%, #06070f 60%, #000005 100%)',
      }}
    >
      {/* Deep space star field with nebula-colored stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 100 }).map((_, i) => {
          const isLargeStar = Math.random() > 0.85
          const isNebula = Math.random() > 0.9
          return (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: isLargeStar ? '3px' : isNebula ? '2px' : '1px',
                height: isLargeStar ? '3px' : isNebula ? '2px' : '1px',
                backgroundColor: isNebula
                  ? ['#a855f7', '#3b82f6', '#ec4899', '#06b6d4'][Math.floor(Math.random() * 4)]
                  : '#ffffff',
              }}
              animate={{
                opacity: [0.15, isLargeStar ? 1 : 0.7, 0.15],
                scale: isLargeStar ? [0.8, 1.4, 0.8] : [0.9, 1.1, 0.9],
              }}
              transition={{
                duration: 1.5 + Math.random() * 4,
                repeat: Infinity,
                delay: Math.random() * 3,
              }}
            />
          )
        })}

        {/* Subtle nebula glow */}
        <div
          className="absolute w-96 h-96 rounded-full opacity-[0.03]"
          style={{
            left: '20%',
            top: '30%',
            background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute w-80 h-80 rounded-full opacity-[0.02]"
          style={{
            right: '15%',
            bottom: '20%',
            background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)',
            filter: 'blur(50px)',
          }}
        />
      </div>

      {/* Spaceship flyby */}
      <AnimatePresence>
        {showSpaceship && (
          <motion.div
            initial={{ x: -300, y: 100, scale: 0.5, rotate: -45 }}
            animate={{
              x: [-300, -50, 50, 400],
              y: [100, 20, -20, -120],
              scale: [0.5, 1, 1.2, 0.2],
              rotate: [-45, 0, 15, 50],
            }}
            transition={{
              duration: 2.5,
              times: [0, 0.3, 0.7, 1],
              ease: 'easeInOut',
            }}
            className="absolute top-1/3 text-6xl z-30"
            style={{ filter: 'drop-shadow(0 0 15px rgba(251,191,36,0.4))' }}
          >
            ���
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main ejection scene */}
      <div className="relative flex flex-col items-center">
        {/* Player being ejected */}
        <motion.div
          className="relative mb-8"
          initial={{ scale: 1, y: 50, rotate: 0 }}
          animate={showSpaceship ? {
            scale: [1, 1.3, 0.8, 0.4, 0.05],
            y: [50, -20, -80, -220, -450],
            x: [0, -10, 15, -25, 40],
            rotate: [0, 45, -30, 180, 720],
          } : { scale: 1, y: 50, rotate: 0 }}
          transition={{
            duration: 3.2,
            times: [0, 0.2, 0.4, 0.7, 1],
            ease: 'easeOut',
          }}
        >
          <Crewmate color={ejectedPlayer.color} size={120} dead={true} />

          {/* Airlock ring effects */}
          {showParticles && (
            <>
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: '3px solid #ef4444', boxShadow: '0 0 15px #ef444444' }}
                initial={{ scale: 1, opacity: 0 }}
                animate={{ scale: [1, 3.5, 6], opacity: [0, 0.8, 0] }}
                transition={{ duration: 1.5, repeat: 2 }}
              />
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: '2px solid #f97316', boxShadow: '0 0 10px #f9731644' }}
                initial={{ scale: 1, opacity: 0 }}
                animate={{ scale: [1, 4.5, 8], opacity: [0, 0.6, 0] }}
                transition={{ duration: 2, delay: 0.3, repeat: 1 }}
              />
            </>
          )}

          {/* Particle explosion */}
          <AnimatePresence>
            {showParticles && [...Array(28)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: `${2 + Math.random() * 4}px`,
                  height: `${2 + Math.random() * 4}px`,
                  backgroundColor: ['#ff4757', '#ffa502', '#ff6348', '#ff3838', '#fbbf24', '#ef4444'][i % 6],
                  left: '50%',
                  top: '50%',
                  boxShadow: `0 0 4px ${['#ff4757', '#ffa502', '#ff6348'][i % 3]}88`,
                }}
                initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                animate={{
                  scale: [0, 1.5, 0],
                  x: [0, Math.cos((i / 28) * 2 * Math.PI) * (70 + Math.random() * 50)],
                  y: [0, Math.sin((i / 28) * 2 * Math.PI) * (70 + Math.random() * 50)],
                  opacity: [1, 1, 0],
                  rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)],
                }}
                transition={{
                  duration: 2.2,
                  ease: 'easeOut',
                  delay: Math.random() * 0.4,
                }}
              />
            ))}
          </AnimatePresence>
        </motion.div>

        {/* Dramatic text reveal */}
        <AnimatePresence>
          {showText && (
            <motion.div
              initial={{ opacity: 0, y: 80, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-6"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 12, stiffness: 180 }}
                className="space-y-3"
              >
                <motion.h1
                  className="text-6xl font-black text-red-400 tracking-[0.3em] uppercase"
                  style={{ textShadow: '0 0 30px #ef4444aa, 0 0 60px #ef444455' }}
                  animate={{
                    textShadow: [
                      '0 0 30px #ef4444aa, 0 0 60px #ef444455',
                      '0 0 50px #ef4444dd, 0 0 80px #ef444488, 0 0 120px #ef444444',
                      '0 0 30px #ef4444aa, 0 0 60px #ef444455',
                    ],
                  }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  ��� EJECTED ���
                </motion.h1>

                <motion.div
                  className="h-0.5 mx-auto rounded-full"
                  style={{
                    width: '220px',
                    background: 'linear-gradient(90deg, transparent, #ef4444, transparent)',
                    boxShadow: '0 0 8px #ef444466',
                  }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-3xl font-black tracking-wider uppercase text-white"
                style={{ textShadow: '0 0 20px rgba(255,255,255,0.15)' }}
              >
                <span style={{ color: '#e8c030', textShadow: '0 0 15px #e8c03066' }}>
                  {ejectedPlayer.name}
                </span>{' '}
                was ejected into space
              </motion.h2>

              {/* Floating debris */}
              <div className="relative h-8">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded"
                    style={{
                      width: `${2 + Math.random() * 3}px`,
                      height: `${2 + Math.random() * 3}px`,
                      backgroundColor: ['#6b7280', '#9ca3af', '#4b5563'][i % 3],
                      left: `${5 + Math.random() * 90}%`,
                      top: `${Math.random() * 100}%`,
                    }}
                    animate={{
                      y: [-10, -120],
                      x: [(Math.random() - 0.5) * 80],
                      rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)],
                      opacity: [0.8, 0],
                    }}
                    transition={{
                      duration: 3.5,
                      delay: Math.random() * 2,
                      ease: 'easeOut',
                      repeat: Infinity,
                      repeatDelay: 1.5,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Role reveal */}
        <AnimatePresence>
          {showRoleReveal && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', damping: 10, stiffness: 130, delay: 0.2 }}
              className="mt-8 text-center"
            >
              <motion.div
                className="px-8 py-4 rounded-2xl inline-block relative overflow-hidden"
                style={{
                  background: wasImposter
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.06))'
                    : 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.06))',
                  border: wasImposter
                    ? '3px solid rgba(16,185,129,0.5)'
                    : '3px solid rgba(239,68,68,0.5)',
                  boxShadow: wasImposter
                    ? '0 0 30px rgba(16,185,129,0.15), inset 0 0 20px rgba(16,185,129,0.05)'
                    : '0 0 30px rgba(239,68,68,0.15), inset 0 0 20px rgba(239,68,68,0.05)',
                }}
                whileHover={{ scale: 1.05 }}
              >
                {/* Background pulse */}
                <motion.div
                  className="absolute inset-0"
                  style={{ backgroundColor: wasImposter ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)' }}
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />

                <motion.p
                  className="text-2xl font-black tracking-wide uppercase relative z-10"
                  style={{
                    color: wasImposter ? '#6ee7b7' : '#fca5a5',
                    textShadow: wasImposter
                      ? '0 0 15px rgba(16,185,129,0.4)'
                      : '0 0 15px rgba(239,68,68,0.4)',
                  }}
                  initial={{ letterSpacing: '0em' }}
                  animate={{ letterSpacing: '0.1em' }}
                  transition={{ duration: 0.8 }}
                >
                  {wasImposter ? '✅ ' : '❌ '}
                  {wasImposter
                    ? `${ejectedPlayer.name} was The Impostor!`
                    : `${ejectedPlayer.name} was NOT The Impostor!`}
                </motion.p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom status */}
      <AnimatePresence>
        {showRoleReveal && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="absolute bottom-12 text-center space-y-3"
          >
            <p
              className="text-lg font-semibold tracking-wider"
              style={{ color: '#6b6b90', textShadow: '0 0 10px rgba(107,107,144,0.2)' }}
            >
              ��� Connection lost... floating in the void... ���
            </p>

            <motion.div
              className="flex items-center justify-center gap-2.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
            >
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: '#e8c030',
                    boxShadow: '0 0 8px #e8c03044',
                  }}
                  animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
