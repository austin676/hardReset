import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import Crewmate from './Crewmate'

interface VoteInfo {
  targetId: string
  voterIds: string[]
  voteCount: number
}

export default function VotingPanel() {
  const { players, voteTally, myPlayerId, meetingResults, votes } = useGameStore()
  const { castVote } = useSocket()
  const [myVote, setMyVote] = useState<string | null>(null)

  const alivePlayers = useMemo(() => players.filter((p) => p.isAlive), [players])
  const votedCount = Object.values(voteTally).filter(Boolean).length
  const totalAlive = alivePlayers.length

  // Calculate vote distribution for real-time display
  const voteDistribution = useMemo(() => {
    const distribution: Record<string, VoteInfo> = {}

    alivePlayers.forEach(player => {
      distribution[player.id] = {
        targetId: player.id,
        voterIds: [],
        voteCount: 0
      }
    })
    distribution['skip'] = {
      targetId: 'skip',
      voterIds: [],
      voteCount: 0
    }

    Object.entries(votes).forEach(([voterId, targetId]) => {
      if (distribution[targetId]) {
        distribution[targetId].voterIds.push(voterId)
        distribution[targetId].voteCount++
      }
    })

    return distribution
  }, [alivePlayers, votes])

  const handleVote = (targetId: string) => {
    if (myVote) return
    if (targetId !== 'skip' && targetId === myPlayerId) return
    setMyVote(targetId)
    castVote('', targetId)
  }

  const getPlayerName = (playerId: string) => {
    return players.find(p => p.id === playerId)?.name ?? 'Unknown'
  }

  return (
    <div
      className="rounded-2xl p-4 space-y-4"
      style={{
        background: 'linear-gradient(135deg, rgba(26,28,58,0.9), rgba(20,22,48,0.9))',
        border: '1px solid rgba(46,48,96,0.5)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-black text-sm tracking-[0.12em] uppercase">Who Is The Impostor?</h3>
        <span className="text-[#6b6b90] text-xs font-bold tabular-nums">{votedCount}/{totalAlive}</span>
      </div>

      {/* Player grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {alivePlayers.map((player) => {
          const isMe = player.id === myPlayerId
          const hasVoted = voteTally[player.id] === true
          const votedMe = myVote === player.id
          const canVote = !myVote && !isMe
          const voteInfo = voteDistribution[player.id]
          const receivedVotes = voteInfo?.voteCount ?? 0

          return (
            <div key={player.id} className="relative">
              <motion.button
                layout
                whileHover={canVote ? { scale: 1.03 } : {}}
                whileTap={canVote ? { scale: 0.96 } : {}}
                onClick={() => canVote && handleVote(player.id)}
                disabled={!canVote}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all relative overflow-hidden"
                style={{
                  background: votedMe
                    ? 'linear-gradient(135deg, rgba(232,192,48,0.12), rgba(232,192,48,0.06))'
                    : 'rgba(16,18,42,0.7)',
                  border: votedMe
                    ? '2px solid rgba(232,192,48,0.5)'
                    : canVote
                    ? '1.5px solid rgba(46,48,96,0.5)'
                    : '1.5px solid rgba(46,48,96,0.3)',
                  boxShadow: votedMe
                    ? '0 0 15px rgba(232,192,48,0.15), inset 0 0 10px rgba(232,192,48,0.05)'
                    : 'none',
                  opacity: canVote || votedMe || isMe ? 1 : 0.5,
                  cursor: canVote ? 'pointer' : 'default',
                }}
              >
                {/* Hover glow effect */}
                {canVote && (
                  <div
                    className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                    style={{
                      background: `radial-gradient(ellipse at center, ${player.color}08 0%, transparent 70%)`,
                    }}
                  />
                )}

                <Crewmate color={player.color} size={36} dead={!player.isAlive} />
                <div className="flex-1 text-left min-w-0 z-10">
                  <p className="text-white font-black text-sm truncate">{player.name}</p>
                  {isMe && <p className="text-[#6b6b90] text-[10px] font-bold">You</p>}
                </div>

                {/* Vote count badge */}
                <AnimatePresence>
                  {receivedVotes > 0 && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="absolute -top-1.5 -right-1.5 rounded-full w-6 h-6 flex items-center justify-center text-xs font-black text-white z-20"
                      style={{
                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                        boxShadow: '0 2px 8px rgba(239,68,68,0.4)',
                        border: '2px solid rgba(26,28,58,0.9)',
                      }}
                    >
                      {receivedVotes}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Status indicators */}
                <div className="flex items-center gap-2 z-10">
                  <AnimatePresence>
                    {hasVoted && (
                      <motion.span
                        initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                        className="text-emerald-400 text-base font-black"
                        title="This player has voted"
                      >
                        ✓
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {votedMe && (
                    <motion.span
                      initial={{ x: 5, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className="text-[#e8c030] text-xs font-black"
                    >
                      ◀
                    </motion.span>
                  )}
                </div>
              </motion.button>

              {/* Vote icons under player */}
              <AnimatePresence>
                {receivedVotes > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-5 left-1/2 transform -translate-x-1/2 flex gap-0.5"
                  >
                    {voteInfo.voterIds.slice(0, 5).map((voterId, index) => (
                      <motion.div
                        key={voterId}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: index * 0.08 }}
                        className="w-3.5 h-3.5 rounded-full text-white text-[7px] flex items-center justify-center font-bold"
                        style={{
                          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                          boxShadow: '0 1px 4px rgba(239,68,68,0.3)',
                        }}
                        title={`Vote from ${getPlayerName(voterId)}`}
                      >
                        ✓
                      </motion.div>
                    ))}
                    {receivedVotes > 5 && (
                      <div className="w-3.5 h-3.5 bg-red-600 rounded-full text-white text-[7px] flex items-center justify-center font-bold">
                        +
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Skip button */}
      <div className="relative">
        <motion.button
          whileHover={!myVote ? { scale: 1.02 } : {}}
          whileTap={!myVote ? { scale: 0.97 } : {}}
          onClick={() => !myVote && handleVote('skip')}
          disabled={!!myVote}
          className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-[0.12em] transition-all relative overflow-hidden"
          style={{
            background: myVote === 'skip'
              ? 'linear-gradient(135deg, rgba(232,192,48,0.12), rgba(232,192,48,0.06))'
              : 'rgba(16,18,42,0.5)',
            border: myVote === 'skip'
              ? '2px solid rgba(232,192,48,0.5)'
              : '1.5px solid rgba(46,48,96,0.4)',
            color: myVote === 'skip' ? '#e8c030' : myVote ? '#2a2a4a' : '#6b6b90',
            boxShadow: myVote === 'skip' ? '0 0 12px rgba(232,192,48,0.1)' : 'none',
            opacity: myVote && myVote !== 'skip' ? 0.4 : 1,
            cursor: myVote ? 'default' : 'pointer',
          }}
        >
          ⏭️ Skip Vote
        </motion.button>

        <AnimatePresence>
          {voteDistribution['skip']?.voteCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1.5 -right-1.5 rounded-full w-6 h-6 flex items-center justify-center text-xs font-black text-white"
              style={{
                background: 'linear-gradient(135deg, #6b7280, #4b5563)',
                boxShadow: '0 2px 8px rgba(107,114,128,0.3)',
                border: '2px solid rgba(26,28,58,0.9)',
              }}
            >
              {voteDistribution['skip'].voteCount}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status footer */}
      <AnimatePresence mode="wait">
        {myVote ? (
          <motion.div
            key="voted"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="px-4 py-3 text-center space-y-2.5 rounded-xl"
            style={{
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.2)',
            }}
          >
            <p className="text-emerald-400 font-black text-sm uppercase tracking-[0.12em]">✓ Vote Cast</p>
            <p className="text-[#6b6b90] text-xs font-semibold">
              {totalAlive - votedCount > 0
                ? `Waiting for ${totalAlive - votedCount} more player${totalAlive - votedCount > 1 ? 's' : ''}...`
                : '��� All votes in! Calculating results...'}
            </p>

            {/* Vote progress bar */}
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(46,48,96,0.4)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(votedCount / totalAlive) * 100}%` }}
                className="h-full rounded-full transition-all duration-500"
                style={{
                  background: 'linear-gradient(90deg, #10b981, #e8c030)',
                  boxShadow: '0 0 8px rgba(16,185,129,0.3)',
                }}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="prompt"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center space-y-1.5"
          >
            <p className="text-[#3a3a5a] text-xs font-bold tracking-widest uppercase">
              ���️ Click a crewmate to vote them out or skip
            </p>
            <p className="text-[#2a2a4a] text-[10px] tabular-nums">
              {votedCount}/{totalAlive} players have voted
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
