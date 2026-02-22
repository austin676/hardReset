import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import Crewmate from './Crewmate'

export default function VotingPanel() {
  const { players, voteTally, myPlayerId } = useGameStore()
  const { castVote } = useSocket()
  const [myVote, setMyVote] = useState<string | null>(null)

  const alivePlayers = useMemo(() => players.filter((p) => p.isAlive), [players])
  const votedCount = Object.values(voteTally).filter(Boolean).length
  const totalAlive = alivePlayers.length

  const handleVote = (targetId: string) => {
    if (myVote) return
    if (targetId !== 'skip' && targetId === myPlayerId) return
    setMyVote(targetId)
    castVote('', targetId)
  }

  return (
    <div className="bg-[#1a1c3a] border-4 border-[#2e3060] rounded-2xl p-4 space-y-4 shadow-[0_4px_24px_#00000044]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-black text-base tracking-wider uppercase">Who Is The Impostor?</h3>
        <span className="text-[#9090b0] text-xs font-bold">{votedCount}/{totalAlive} voted</span>
      </div>

      {/* Player grid */}
      <div className="grid grid-cols-2 gap-2">
        {alivePlayers.map((player) => {
          const isMe     = player.id === myPlayerId
          const hasVoted = voteTally[player.id] === true
          const votedMe  = myVote === player.id
          const canVote  = !myVote && !isMe

          return (
            <motion.button
              key={player.id}
              layout
              whileHover={canVote ? { scale: 1.03 } : {}}
              whileTap={canVote ? { scale: 0.96 } : {}}
              onClick={() => canVote && handleVote(player.id)}
              disabled={!canVote}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all
                ${votedMe
                  ? 'border-[#e8c030] bg-[#e8c03015] shadow-[0_0_12px_#e8c03033]'
                  : canVote
                  ? 'border-[#2e3060] bg-[#10122a] hover:border-[#4a4e80] cursor-pointer'
                  : 'border-[#2e3060] bg-[#10122a] opacity-60 cursor-default'}`}
            >
              <Crewmate color={player.color} size={36} dead={!player.isAlive} />
              <div className="flex-1 text-left min-w-0 z-10">
                <p className="text-white font-black text-sm truncate">{player.name}</p>
                {isMe && <p className="text-[#9090b0] text-xs font-bold">You</p>}
              </div>
              <AnimatePresence>
                {hasVoted && (
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                    className="text-[#1d8c3a] text-base font-black z-10"
                    title="Voted"
                  >
                    &#10003;
                  </motion.span>
                )}
              </AnimatePresence>
              {votedMe && <span className="text-[#e8c030] text-xs font-black z-10 ml-1">&#9664;</span>}
            </motion.button>
          )
        })}
      </div>

      {/* Skip button */}
      <motion.button
        whileHover={!myVote ? { scale: 1.02 } : {}}
        whileTap={!myVote ? { scale: 0.97 } : {}}
        onClick={() => !myVote && handleVote('skip')}
        disabled={!!myVote}
        className={`w-full py-2.5 rounded-xl border-2 font-black text-sm uppercase tracking-widest transition-all
          ${myVote === 'skip'
            ? 'border-[#e8c030] bg-[#e8c03015] text-[#e8c030]'
            : myVote
            ? 'border-[#2e3060] bg-[#10122a] text-[#40405a] opacity-50 cursor-default'
            : 'border-[#2e3060] bg-[#10122a] text-[#9090b0] hover:border-[#4a4e80] hover:text-white cursor-pointer'}`}
      >
        Skip Vote
      </motion.button>

      {/* Status footer */}
      <AnimatePresence>
        {myVote ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="bg-[#10122a] border-2 border-[#1d8c3a] rounded-xl px-4 py-3 text-center"
          >
            <p className="text-[#1d8c3a] font-black text-sm uppercase tracking-widest">Vote Cast</p>
            <p className="text-[#9090b0] text-xs font-bold mt-0.5">
              {totalAlive - votedCount > 0
                ? `Waiting for ${totalAlive - votedCount} more...`
                : 'All votes in...'}
            </p>
          </motion.div>
        ) : (
          <p className="text-[#40405a] text-xs font-bold tracking-widest uppercase text-center">
            Click a crewmate to vote or skip
          </p>
        )}
      </AnimatePresence>
    </div>
  )
}
