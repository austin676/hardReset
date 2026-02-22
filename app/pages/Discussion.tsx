import { useState, useCallback } from 'react'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import MeetingPopup from '../components/MeetingPopup'
import ChatBox from '../components/ChatBox'
import VotingPanel from '../components/VotingPanel'
import EjectionScreen from '../components/EjectionScreen'
import { motion } from 'framer-motion'

export default function Discussion() {
  const { gamePhase, duelState, players, myPlayerId, meetingTimer } = useGameStore()
  const { submitDuelCode } = useSocket()
  const [duelCode, setDuelCode] = useState('')

  const amInDuel = duelState?.active && duelState.tiedPlayers?.includes(myPlayerId ?? '')
  const nameOf = (id: string) => players.find(p => p.id === id)?.name ?? 'Unknown'

  const handleDuelSubmit = useCallback(() => {
    const rc = useGameStore.getState().roomCode
    if (!duelCode.trim() || !rc) return
    submitDuelCode(rc, duelCode)
  }, [duelCode, submitDuelCode])

  useSocket()

  if (gamePhase === 'ejection') return <EjectionScreen />

  // ── Duel phase ──────────────────────────────────────────────────
  if (gamePhase === 'duel' && duelState?.active) {
    const duelTimer = duelState.timer ?? 0
    return (
      <div className="h-screen bg-[#0a0014] flex flex-col items-center justify-center gap-6 p-8">
        <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-6xl">⚔️</motion.p>
        <h2 className="text-[#e8c030] font-black text-2xl tracking-[0.15em] uppercase">
          Tie-Breaker Duel!
        </h2>
        <p className="text-[#9090b0] text-sm font-bold text-center max-w-lg">
          {duelState.tiedPlayers.map((id: string) => nameOf(id)).join(' vs ')} &mdash; first to solve wins!
          The loser will be marked as dead.
        </p>

        {/* Timer */}
        <motion.p
          className={`font-mono font-black text-2xl tracking-widest
            ${duelTimer <= 10 ? 'text-red-400 animate-pulse' : 'text-[#e8c030]'}`}
          key={duelTimer}
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
        >
          ⏱ {Math.floor(duelTimer / 60)}:{String(duelTimer % 60).padStart(2, '0')}
        </motion.p>

        {/* Puzzle */}
        <div className="bg-[#10122a] border border-[#2e3060] rounded-xl p-5 w-full max-w-2xl">
          <h4 className="text-white font-black text-sm tracking-wider uppercase mb-2">
            {duelState.puzzle?.title ?? 'Coding Challenge'}
          </h4>
          <p className="text-[#c0c0d0] text-sm leading-relaxed mb-3">
            {duelState.puzzle?.prompt ?? 'Loading puzzle...'}
          </p>

          {amInDuel ? (
            <>
              <textarea
                value={duelCode}
                onChange={e => setDuelCode(e.target.value)}
                placeholder={duelState.puzzle?.starterCode ?? '// Write your solution here...'}
                className="w-full h-44 bg-[#080a14] border border-[#2e3060] rounded-lg px-4 py-3
                           text-sm text-green-300 font-mono placeholder-[#2e3060]
                           outline-none focus:border-[#e8c030]/50 resize-none"
              />
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={handleDuelSubmit}
                  disabled={!duelCode.trim()}
                  className="px-6 py-2.5 bg-[#e8c030] text-[#0c0e1a] font-black text-sm rounded-lg
                             hover:bg-[#f0d060] active:scale-95 disabled:opacity-30 transition-all"
                >
                  Submit Solution
                </button>
                {duelState.myResult === 'wrong' && (
                  <span className="text-red-400 text-sm font-bold">✗ Incorrect — try again!</span>
                )}
                {duelState.myResult === 'pending' && (
                  <span className="text-[#9090b0] text-sm font-bold animate-pulse">Checking...</span>
                )}
              </div>
            </>
          ) : (
            <div className="text-[#9090b0] text-sm font-bold text-center py-6">
              ⏳ Watching the duel... waiting for a winner
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#0a0014] flex flex-col overflow-hidden">
      {/* Top navbar */}
      <MeetingPopup />

      {/* Main content — full remaining height */}
      <div className="flex flex-1 gap-4 p-4 overflow-hidden">
        {/* Chat — right column, fills height */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ChatBox />
        </div>
        {/* Voting panel — left column */}
        <div className="w-[45%] overflow-y-auto">
          <VotingPanel />
        </div>
      </div>
    </div>
  )
}
