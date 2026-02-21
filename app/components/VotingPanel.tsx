import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import Crewmate from './Crewmate'

interface VotePlayer {
  id: string
  name: string
  color: string
  isAlive: boolean
  isMe: boolean
}

const DEMO_PLAYERS: VotePlayer[] = [
  { id: 'me',     name: 'You',    color: '#1267ab', isAlive: true, isMe: true  },
  { id: 'demo_2', name: 'Alex',   color: '#c51111', isAlive: true, isMe: false },
  { id: 'demo_3', name: 'Jordan', color: '#19803a', isAlive: true, isMe: false },
  { id: 'demo_4', name: 'Sam',    color: '#d6e30f', isAlive: true, isMe: false },
]

const AI_VOTE_DELAYS = [900, 1600, 2400]

export default function VotingPanel() {
  const { players, votes: storeVotes, myPlayerId, addVote } = useGameStore()
  const { castVote } = useSocket()

  const roster = useMemo<VotePlayer[]>(() => {
    if (players.length > 0)
      return players.filter((p) => p.isAlive).map((p) => ({ ...p, isMe: p.id === myPlayerId }))
    return DEMO_PLAYERS
  }, [players, myPlayerId])

  const myId = myPlayerId ?? 'me'
  const [localVotes, setLocalVotes] = useState<Record<string, string>>({})
  const myVote = localVotes[myId] ?? null

  useEffect(() => {
    if (Object.keys(storeVotes).length > 0)
      setLocalVotes((prev) => ({ ...prev, ...storeVotes }))
  }, [storeVotes])

  const getVoteCount = (targetId: string) =>
    Object.values(localVotes).filter((v) => v === targetId).length

  const handleVote = (targetId: string) => {
    if (myVote) return
    setLocalVotes((prev) => ({ ...prev, [myId]: targetId }))
    castVote(myId, targetId)
    addVote(myId, targetId)

    if (players.length === 0) {
      const aiPlayers = DEMO_PLAYERS.filter((p) => !p.isMe)
      const allIds = DEMO_PLAYERS.map((p) => p.id)
      aiPlayers.forEach((ai, i) => {
        setTimeout(() => {
          const options = allIds.filter((id) => id !== ai.id)
          const pick = options[Math.floor(Math.random() * options.length)]
          setLocalVotes((prev) => ({ ...prev, [ai.id]: pick }))
        }, AI_VOTE_DELAYS[i])
      })
    }
  }

  const totalVotes = Object.keys(localVotes).length
  const totalPlayers = roster.length

  return (
    <div className="bg-[#1a1c3a] border-4 border-[#2e3060] rounded-2xl p-4 space-y-4
                    shadow-[0_4px_24px_#00000044]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-black text-base tracking-wider uppercase">
          Who Is The Impostor?
        </h3>
        <span className="text-[#9090b0] text-xs font-bold">{totalVotes}/{totalPlayers} voted</span>
      </div>

      {/* 2-column grid â€” exactly like Among Us meeting panel */}
      <div className="grid grid-cols-2 gap-2">
        {roster.map((player) => {
          const voteCount = getVoteCount(player.id)
          const isVotedByMe = myVote === player.id
          const canVote = !myVote && !player.isMe
          const pct = totalVotes > 0 ? Math.round((voteCount / totalPlayers) * 100) : 0

          return (
            <motion.div key={player.id} layout className="space-y-1">
              <motion.button
                whileHover={canVote ? { scale: 1.03 } : {}}
                whileTap={canVote ? { scale: 0.96 } : {}}
                onClick={() => canVote && handleVote(player.id)}
                disabled={!canVote}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all relative overflow-hidden
                            ${ isVotedByMe
                                ? 'border-[#e8c030] bg-[#e8c03015] shadow-[0_0_12px_#e8c03033]'
                                : canVote
                                ? 'border-[#2e3060] bg-[#10122a] hover:border-[#4a4e80] cursor-pointer'
                                : player.isMe
                                ? 'border-[#2e3060] bg-[#10122a] opacity-50 cursor-default'
                                : 'border-[#2e3060] bg-[#10122a] opacity-60 cursor-default' }`}
              >
                {/* Vote bar fill */}
                {myVote && pct > 0 && (
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0 bg-[#e81010] opacity-10 pointer-events-none"
                  />
                )}

                <Crewmate color={player.color} size={36} dead={!player.isAlive} />

                <div className="flex-1 text-left min-w-0 z-10">
                  <p className="text-white font-black text-sm truncate">{player.name}</p>
                  {player.isMe && <p className="text-[#9090b0] text-xs font-bold">You</p>}
                  {!player.isAlive && <p className="text-[#e85050] text-xs font-bold uppercase">Dead</p>}
                </div>

                {/* Vote badges */}
                <div className="flex gap-0.5 z-10">
                  {Array.from({ length: voteCount }).map((_, i) => (
                    <motion.div key={i}
                      initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', delay: i * 0.08 }}
                      className="w-5 h-5 rounded-full bg-[#e81010] flex items-center justify-center
                                 text-white text-xs font-black shadow-[0_0_6px_#e8101088]"
                    >âœ—</motion.div>
                  ))}
                </div>

                {isVotedByMe && (
                  <span className="text-[#e8c030] text-xs font-black z-10">â—€</span>
                )}
              </motion.button>

              {/* Pct bar */}
              <AnimatePresence>
                {myVote && pct > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-1">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1 bg-[#10122a] rounded-full overflow-hidden border border-[#2e3060]">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6 }}
                          className="h-full rounded-full bg-[#e81010]"
                        />
                      </div>
                      <span className="text-[#e81010] text-xs font-black w-7">{pct}%</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      {/* Status */}
      <AnimatePresence>
        {myVote ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="bg-[#10122a] border-2 border-[#1d8c3a] rounded-xl px-4 py-3 text-center"
          >
            <p className="text-[#1d8c3a] font-black text-sm uppercase tracking-widest">âœ“ Vote Cast</p>
            <p className="text-[#9090b0] text-xs font-bold mt-0.5">
              {totalPlayers - totalVotes > 0
                ? `Waiting for ${totalPlayers - totalVotes} more...`
                : 'All votes in!'}
            </p>
          </motion.div>
        ) : (
          <p className="text-[#40405a] text-xs font-bold tracking-widest uppercase text-center">
            Click a crewmate to vote
          </p>
        )}
      </AnimatePresence>
    </div>
  )
}
