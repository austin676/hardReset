import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import Crewmate from './Crewmate'
import VotingPanel from './VotingPanel'

// ─── Enhanced MeetingOverlay ──────────────────────────────────────
// Full-screen React overlay shown during emergency meetings.
// Side-by-side layout: Chat (left ~60%) + Players/Voting (right ~40%)
// Enhanced with real-time vote tracking, improved animations, and better UX

export default function MeetingOverlay() {
  const {
    players,
    myPlayerId,
    gamePhase,
    roomCode,
    voteTally,
    meetingChatMessages,
    meetingCallerName,
    meetingTimer,
    meetingResults,
    ejectedPlayer,
    wasImposter,
    duelState,
    votes,
  } = useGameStore()

  const { castVote, sendMeetingChat, submitDuelCode } = useSocket()
  const [myVote, setMyVote] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [showVotePanel, setShowVotePanel] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastMsgCountRef = useRef(0)

  // Duel state
  const [duelCode, setDuelCode] = useState('')

  // Enhanced vote tracking
  const [votePhaseStarted, setVotePhaseStarted] = useState(false)

  // Derived
  const alivePlayers = useMemo(() => players.filter(p => p.isAlive), [players])
  const deadPlayers = useMemo(() => players.filter(p => !p.isAlive), [players])
  const votedCount = Object.values(voteTally).filter(Boolean).length
  const totalAlive = alivePlayers.length
  const meAlive = alivePlayers.some(p => p.id === myPlayerId)

  // Vote completion percentage for UI
  const voteProgress = totalAlive > 0 ? (votedCount / totalAlive) * 100 : 0
  const allVotesIn = votedCount === totalAlive && totalAlive > 0

  // Am I in the duel?
  const amInDuel = duelState?.active && duelState.tiedPlayers?.includes(myPlayerId ?? '')
  const showDuel = gamePhase === 'duel' && duelState?.active

  // Enhanced effects for voting phase transitions
  useEffect(() => {
    if (gamePhase === 'voting' && !votePhaseStarted) {
      setVotePhaseStarted(true)
      setShowVotePanel(true) // Auto-switch to voting panel
    } else if (gamePhase === 'discussion') {
      setVotePhaseStarted(false)
    }
  }, [gamePhase, votePhaseStarted])

  // Show results phase
  const showResults = gamePhase === 'ejection' && meetingResults

  // ── Scroll chat to bottom on new messages ─────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    // Track unread when vote panel is shown
    if (showVotePanel && meetingChatMessages.length > lastMsgCountRef.current) {
      setUnreadCount(prev => prev + (meetingChatMessages.length - lastMsgCountRef.current))
    }
    lastMsgCountRef.current = meetingChatMessages.length
  }, [meetingChatMessages, showVotePanel])

  // Enhanced timer effects - more dramatic as time runs out
  const isVotingPhase = gamePhase === 'voting'
  const timerCritical = meetingTimer <= 10
  const timerUrgent = meetingTimer <= 30

  // Reset when meeting opens
  useEffect(() => {
    if (gamePhase === 'discussion' || gamePhase === 'voting') {
      setMyVote(null)
      if (gamePhase === 'discussion') {
        setShowVotePanel(false) // Start with discussion, vote panel opens automatically in voting phase
      }
      setUnreadCount(0)
      lastMsgCountRef.current = 0
      setDuelCode('')
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [gamePhase])

  // Clear unread when switching back to chat
  useEffect(() => {
    if (!showVotePanel) {
      setUnreadCount(0)
      lastMsgCountRef.current = meetingChatMessages.length
    }
  }, [showVotePanel, meetingChatMessages.length])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleVote = useCallback((targetId: string) => {
    if (myVote || !meAlive) return
    if (targetId !== 'skip' && targetId === myPlayerId) return
    setMyVote(targetId)
    castVote(roomCode ?? '', targetId)
  }, [myVote, meAlive, myPlayerId, roomCode, castVote])

  const handleSendChat = useCallback(() => {
    const msg = chatInput.trim()
    if (!msg || !roomCode || !meAlive) return
    sendMeetingChat(roomCode, msg)
    setChatInput('')
    inputRef.current?.focus()
  }, [chatInput, roomCode, meAlive, sendMeetingChat])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendChat()
    }
  }

  const handleDuelSubmit = useCallback(() => {
    if (!duelCode.trim() || !roomCode) return
    submitDuelCode(roomCode, duelCode)
  }, [duelCode, roomCode, submitDuelCode])

  // Format timer with enhanced visual feedback — use duel timer when in duel phase
  const isDuelPhase = gamePhase === 'duel'
  const activeTimer = isDuelPhase && duelState?.timer != null ? duelState.timer : meetingTimer
  const timerDisplay = `${Math.floor(activeTimer / 60)}:${String(activeTimer % 60).padStart(2, '0')}`
  
  // Dynamic timer styling based on urgency and phase
  const getTimerStyle = () => {
    if (isDuelPhase) {
      if (activeTimer <= 10) return 'text-red-300 border-red-400/60 bg-red-500/20 shadow-[0_0_20px_#ef444455] animate-pulse'
      if (activeTimer <= 30) return 'text-orange-300 border-orange-400/50 bg-orange-500/15 shadow-[0_0_15px_#ea850844]'
      return 'text-purple-300 border-purple-400/40 bg-purple-500/10 shadow-[0_0_10px_#a855f733]'
    }
    if (timerCritical) {
      return 'text-red-300 border-red-400/60 bg-red-500/20 shadow-[0_0_20px_#ef444455] animate-pulse'
    } else if (timerUrgent) {
      return 'text-yellow-300 border-yellow-400/50 bg-yellow-500/15 shadow-[0_0_15px_#eab30844]'
    } else if (isVotingPhase) {
      return 'text-green-300 border-green-400/40 bg-green-500/10 shadow-[0_0_10px_#22c55e33]'
    } else {
      return 'text-[#e8c030] border-[#e8c030]/25 bg-[#e8c030]/5'
    }
  }

  // Get appropriate phase indicator
  const getPhaseInfo = () => {
    if (isDuelPhase) {
      return { emoji: '⚔️', text: 'TIE-BREAKER DUEL', subtext: 'First to solve the puzzle wins!' }
    } else if (isVotingPhase) {
      return { emoji: '🗳️', text: 'VOTING PHASE', subtext: `${votedCount}/${totalAlive} voted` }
    } else if (gamePhase === 'ejection') {
      return { emoji: '🚀', text: 'EJECTION', subtext: 'A player has been ejected' }
    } else {
      return { emoji: '💬', text: 'DISCUSSION', subtext: 'Share your thoughts' }
    }
  }

  const phaseInfo = getPhaseInfo()

  // Helpers
  const nameOf = (id: string) => players.find(p => p.id === id)?.name ?? 'Unknown'
  const colorOf = (id: string) => players.find(p => p.id === id)?.color ?? '#666'
  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  // ── Don't render if not in meeting phase ─────────────────────────────────
  if (
    gamePhase !== 'discussion' &&
    gamePhase !== 'voting' &&
    gamePhase !== 'ejection' &&
    gamePhase !== 'duel'
  ) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.88)' }}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
        className="w-275 max-w-[96vw] h-[85vh] flex flex-col bg-[#0c0e1a] border border-[#1e2046] rounded-2xl shadow-[0_0_80px_#00000099,0_0_30px_#e8c03011] overflow-hidden"
      >
        {/* ═══════ ENHANCED HEADER ═══════ */}
        <div className="bg-linear-to-r from-[#10122a] via-[#131535] to-[#10122a] border-b-2 border-[#e8c030] px-6 py-3 flex items-center gap-4 shrink-0 relative overflow-hidden">
          {/* Background phase indicator */}
          <motion.div
            className={`absolute inset-0 opacity-5 ${
              isVotingPhase ? 'bg-green-400' : 'bg-[#e8c030]'
            }`}
            animate={{
              opacity: timerCritical ? [0.05, 0.15, 0.05] : 0.05
            }}
            transition={{
              duration: 1,
              repeat: timerCritical ? Infinity : 0
            }}
          />

          <motion.span
            animate={{ 
              scale: timerCritical ? [1, 1.4, 1] : [1, 1.3, 1],
              rotate: [-10, 10, -10] 
            }}
            transition={{ 
              repeat: Infinity, 
              duration: timerCritical ? 0.5 : 0.8 
            }}
            className="text-2xl relative z-10"
          >
            {phaseInfo.emoji}
          </motion.span>

          <div className="flex-1 min-w-0 relative z-10">
            <motion.h2 
              className="text-[#e8c030] font-black text-lg tracking-[0.2em] uppercase drop-shadow-[0_0_8px_#e8c03066]"
              animate={isVotingPhase ? {
                textShadow: [
                  "0 0 8px #e8c03066",
                  "0 0 12px #22c55e66",
                  "0 0 8px #e8c03066"
                ]
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              Emergency Meeting • {phaseInfo.text}
            </motion.h2>
            <p className="text-[#9090b0] text-[10px] font-bold tracking-wider truncate">
              {meetingCallerName
                ? `Called by ${meetingCallerName} • ${phaseInfo.subtext}`
                : phaseInfo.subtext}
            </p>
          </div>

          {/* Enhanced Timer */}
          <motion.div 
            key={`timer-${isVotingPhase}-${isDuelPhase}`}
            initial={{ scale: 1 }}
            animate={timerCritical ? { scale: [1, 1.05, 1] } : { scale: 1 }}
            transition={timerCritical ? { duration: 1, repeat: Infinity } : { duration: 0.2 }}
            className={`text-xl font-black font-mono tracking-widest px-4 py-1.5 rounded-lg border-2 shrink-0 relative z-10 transition-all duration-300 ${getTimerStyle()}`}
          >
            ⏱ {timerDisplay}
            
            {/* Voting completion indicator */}
            {isVotingPhase && (
              <motion.div
                className="absolute -bottom-1 left-0 h-0.5 bg-green-400 rounded"
                style={{ width: `${voteProgress}%` }}
                animate={{ width: `${voteProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            )}
          </motion.div>

          {/* Enhanced Player status dots */}
          <div className="flex items-center gap-1 ml-1 shrink-0 relative z-10">
            <span className="text-[9px] font-bold text-[#9090b0] mr-1">{votedCount}/{totalAlive}</span>
            {players.map(p => (
              <motion.div
                key={p.id}
                title={`${p.name}${p.isAlive ? '' : ' (dead)'}${voteTally[p.id] ? ' ✓ voted' : ''}`}
                className={`w-3 h-3 rounded-full border transition-all duration-300 relative
                  ${voteTally[p.id] 
                    ? 'border-green-400 ring-1 ring-green-400/40' 
                    : p.isAlive 
                    ? 'border-[#1e2040]' 
                    : 'border-[#40405a] opacity-40'}`}
                style={{ backgroundColor: p.color, opacity: p.isAlive ? 1 : 0.3 }}
                animate={voteTally[p.id] ? {
                  scale: [1, 1.2, 1],
                } : {}}
                transition={{ duration: 0.3 }}
              >
                {voteTally[p.id] && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <span className="text-[6px] text-white font-bold">✓</span>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* ═══════ DUEL OVERLAY ═══════ */}
        <AnimatePresence>
          {showDuel && duelState && (
            <motion.div
              key="duel"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-4 p-6 min-h-0"
            >
              <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-4xl">⚔️</motion.p>
              <h3 className="text-[#e8c030] font-black text-xl tracking-[0.15em] uppercase">
                Tie-Breaker Duel!
              </h3>
              <p className="text-[#9090b0] text-sm font-bold text-center max-w-lg">
                {duelState.tiedPlayers.map((id: string) => nameOf(id)).join(' vs ')} — first to solve wins!
                The loser will be marked as dead.
              </p>

              {/* The puzzle */}
              <div className="bg-[#10122a] border border-[#2e3060] rounded-xl p-4 w-full max-w-2xl">
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
                      className="w-full h-40 bg-[#080a14] border border-[#2e3060] rounded-lg px-4 py-3
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

              {/* Duel timer */}
              {duelState.timer != null && (
                <p className={`font-mono font-black text-lg tracking-widest
                  ${duelState.timer <= 10 ? 'text-red-400 animate-pulse' : 'text-[#e8c030]'}`}>
                  ⏱ {Math.floor(duelState.timer / 60)}:{String(duelState.timer % 60).padStart(2, '0')}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════ RESULTS OVERLAY ═══════ */}
        <AnimatePresence>
          {showResults && meetingResults && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-6 p-8 min-h-0"
            >
              {meetingResults.ejected ? (
                <>
                  {/* Elimination Animation */}
                  <motion.div className="relative">
                    <motion.div 
                      initial={{ scale: 0 }} 
                      animate={{ scale: 1 }} 
                      transition={{ type: 'spring', delay: 0.2 }}
                    >
                      <Crewmate color={colorOf(meetingResults.ejected)} size={120} dead />
                    </motion.div>
                    
                    {/* Particle explosion effect */}
                    {[...Array(12)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-2 h-2 bg-red-400 rounded-full"
                        initial={{ 
                          x: 0, 
                          y: 0, 
                          scale: 0,
                          opacity: 1 
                        }}
                        animate={{ 
                          x: Math.cos((i * 30) * Math.PI / 180) * 100,
                          y: Math.sin((i * 30) * Math.PI / 180) * 100,
                          scale: [0, 1, 0],
                          opacity: [1, 1, 0]
                        }}
                        transition={{ 
                          duration: 1.5,
                          delay: 0.5 + (i * 0.05),
                          ease: "easeOut"
                        }}
                        style={{
                          left: '50%',
                          top: '50%',
                          transform: 'translate(-50%, -50%)'
                        }}
                      />
                    ))}
                  </motion.div>
                  
                  <motion.h3 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="text-white font-black text-2xl tracking-wider uppercase"
                  >
                    {nameOf(meetingResults.ejected)} was ejected
                  </motion.h3>
                  <p className="text-[#9090b0] text-xs font-bold tracking-wider">
                    They can still complete tasks but cannot vote or chat.
                  </p>
                  {ejectedPlayer && wasImposter !== null && (
                    <p className={`font-black text-lg tracking-widest uppercase ${
                      wasImposter ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {wasImposter ? '✓ They were the Impostor' : '✗ They were NOT the Impostor'}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-6xl">🤷</motion.p>
                  <h3 className="text-white font-black text-2xl tracking-wider uppercase">
                    {meetingResults.tie ? 'Tie — No one was ejected' : 'No one was ejected'}
                  </h3>
                </>
              )}

              {/* Vote breakdown */}
              <div className="bg-[#10122a] border border-[#2e3060] rounded-xl p-4 w-full max-w-lg">
                <h4 className="text-[#9090b0] font-black text-xs tracking-widest uppercase mb-3">Vote Results</h4>
                
                {/* Vote counts by target */}
                <div className="space-y-2 mb-4">
                  <h5 className="text-[#9090b0] text-[10px] font-bold tracking-wider uppercase">Final Tally</h5>
                  {Object.entries(meetingResults.voteCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([targetId, count]) => (
                      <div key={targetId} className="flex items-center gap-3">
                        {targetId === 'skip' ? (
                          <span className="text-[#9090b0] font-bold text-sm w-20">Skip</span>
                        ) : (
                          <span className="text-white font-bold text-sm w-20 flex items-center gap-1.5 truncate">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorOf(targetId) }} />
                            {nameOf(targetId)}
                          </span>
                        )}
                        <div className="flex-1 h-2 bg-[#1a1c3a] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(count / totalAlive) * 100}%` }}
                            transition={{ delay: 0.3, duration: 0.6 }}
                            className="h-full bg-[#e8c030] rounded-full"
                          />
                        </div>
                        <span className="text-[#e8c030] font-black text-sm w-5 text-right">{count}</span>
                      </div>
                    ))}
                </div>
                
                {/* Individual votes breakdown */}
                {meetingResults.individualVotes && meetingResults.individualVotes.length > 0 && (
                  <div className="border-t border-[#2e3060] pt-3">
                    <h5 className="text-[#9090b0] text-[10px] font-bold tracking-wider uppercase mb-2">Who Voted For Whom</h5>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {meetingResults.individualVotes.map((vote, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-white font-bold truncate shrink-0">{vote.voterName}</span>
                          <span className="text-[#9090b0]">→</span>
                          <span className={`font-bold truncate ${
                            vote.targetId === 'skip' ? 'text-[#9090b0]' : 'text-[#e8c030]'
                          }`}>
                            {vote.targetName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════ MAIN CONTENT — side-by-side chat + players/vote ═══════ */}
        {!showResults && !showDuel && (
          <div className="flex-1 flex min-h-0">

            {/* ────── LEFT: Chat Room (takes ~60%) ────── */}
            <div className="flex-2 flex flex-col min-h-0 min-w-0 border-r border-[#1e2040]">

              {/* Chat header */}
              <div className="px-4 py-2.5 border-b border-[#1e2040] flex items-center justify-between shrink-0 bg-[#0e1020]">
                <div className="flex items-center gap-2">
                  <span className="text-base">💬</span>
                  <h3 className="text-white font-black text-sm tracking-widest uppercase">Discussion</h3>
                  <span className="text-[#40405a] text-[10px] font-bold">
                    {meetingChatMessages.length} msg{meetingChatMessages.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {!meAlive && (
                  <span className="text-[#40405a] text-[10px] font-bold tracking-wider uppercase">
                    👻 Spectating
                  </span>
                )}
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-1.5"
                   style={{ scrollbarWidth: 'thin', scrollbarColor: '#2e3060 #0c0e1a' }}>

                {/* System message: meeting started */}
                <div className="flex justify-center py-2">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-[#e8c030]/60 bg-[#e8c03008] border border-[#e8c030]/10 rounded-full px-3 py-1">
                    🚨 {meetingCallerName ? `${meetingCallerName} called an emergency meeting` : 'Emergency meeting started'}
                  </span>
                </div>

                {meetingChatMessages.length === 0 && (
                  <p className="text-[#40405a] text-sm text-center py-6 font-mono">
                    No messages yet. Start the discussion!
                  </p>
                )}

                {meetingChatMessages.map((msg, i) => {
                  const isMe = msg.playerId === myPlayerId
                  const showAvatar = i === 0 || meetingChatMessages[i - 1].playerId !== msg.playerId
                  const playerColor = colorOf(msg.playerId)
                  return (
                    <div key={`${msg.playerId}-${msg.timestamp}-${i}`}>
                      {/* Show name + avatar above a message group */}
                      {showAvatar && (
                        <div className={`flex items-center gap-1.5 mt-3 mb-0.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                          <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: playerColor }} />
                          <span className="text-[10px] font-black tracking-wider uppercase" style={{ color: playerColor }}>
                            {isMe ? 'You' : msg.playerName}
                          </span>
                          <span className="text-[9px] text-[#40405a] font-mono">{formatTime(msg.timestamp)}</span>
                        </div>
                      )}
                      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: 4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ duration: 0.15 }}
                          className={`max-w-[80%] px-3 py-1.5 text-sm leading-relaxed overflow-wrap-break-word
                            ${isMe
                              ? 'bg-[#1e3a8a] text-white rounded-2xl rounded-tr-md'
                              : 'bg-[#181a30] text-[#d0d0e0] border border-[#252840] rounded-2xl rounded-tl-md'}`}
                        >
                          {msg.message}
                        </motion.div>
                      </div>
                    </div>
                  )
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              {meAlive ? (
                <div className="px-3 py-2.5 border-t border-[#1e2040] flex gap-2 shrink-0 bg-[#0a0c18]">
                  <input
                    ref={inputRef}
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={200}
                    placeholder="Type a message to discuss..."
                    className="flex-1 bg-[#10122a] border border-[#2e3060] rounded-xl px-4 py-2 text-sm text-white
                               placeholder-[#40405a] outline-none focus:border-[#e8c030]/50 focus:bg-[#12142e] transition-all"
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={!chatInput.trim()}
                    className="px-5 py-2 bg-[#e8c030] text-[#0c0e1a] font-black text-xs tracking-wider rounded-xl
                               hover:bg-[#f0d060] active:scale-95 disabled:opacity-20 disabled:cursor-default transition-all"
                  >
                    SEND
                  </button>
                </div>
              ) : (
                <div className="px-3 py-2 border-t border-[#1e2040] text-center shrink-0 bg-[#0a0c18]">
                  <p className="text-[#40405a] text-[10px] font-bold tracking-widest uppercase">
                    👻 Dead players cannot chat
                  </p>
                </div>
              )}
            </div>

            {/* ────── RIGHT: Players + Voting (~40%) ────── */}
            <div className="flex-[1.2] flex flex-col min-h-0 min-w-0 bg-[#0b0d18]">

              {/* Right panel header — toggle between player list and vote */}
              <div className="flex border-b border-[#1e2040] shrink-0">
                <button
                  onClick={() => { setShowVotePanel(false); setUnreadCount(0) }}
                  className={`flex-1 py-2.5 text-[10px] font-black tracking-[0.15em] uppercase transition-all
                    ${!showVotePanel
                      ? 'text-[#e8c030] border-b-2 border-[#e8c030] bg-[#e8c03008]'
                      : 'text-[#40405a] hover:text-[#9090b0] border-b-2 border-transparent'}`}
                >
                  👥 Players ({alivePlayers.length + deadPlayers.length})
                </button>
                <button
                  onClick={() => setShowVotePanel(true)}
                  className={`flex-1 py-2.5 text-[10px] font-black tracking-[0.15em] uppercase transition-all relative
                    ${showVotePanel
                      ? 'text-[#e8c030] border-b-2 border-[#e8c030] bg-[#e8c03008]'
                      : 'text-[#40405a] hover:text-[#9090b0] border-b-2 border-transparent'}`}
                >
                  🗳️ Vote ({votedCount}/{totalAlive})
                  {!showVotePanel && unreadCount > 0 && (
                    <span className="ml-1.5 bg-blue-500 text-white text-[8px] px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                  )}
                  {isVotingPhase && (
                    <motion.div
                      className="absolute bottom-0 left-0 h-0.5 bg-green-400"
                      style={{ width: `${voteProgress}%` }}
                      animate={{ width: `${voteProgress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  )}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 p-3" style={{ scrollbarWidth: 'thin', scrollbarColor: '#2e3060 #0b0d18' }}>
                <AnimatePresence mode="wait">

                  {/* ── Enhanced Player List ── */}
                  {!showVotePanel && (
                    <motion.div key="players" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                      {/* Alive players */}
                      <div className="space-y-1.5">
                        <p className="text-[#e8c030] text-[9px] font-black tracking-[0.15em] uppercase mb-2 px-1">
                          Alive ({alivePlayers.length})
                        </p>
                        {alivePlayers.map(p => (
                          <motion.div 
                            key={p.id}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#10122a] border border-[#1e2040] hover:border-[#2e3060] transition-colors"
                            whileHover={{ scale: 1.02 }}
                          >
                            <Crewmate color={p.color} size={28} />
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-bold text-xs truncate">
                                {p.name} {p.id === myPlayerId && <span className="text-[#9090b0]">(you)</span>}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {voteTally[p.id] && (
                                <motion.span 
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="text-green-400 text-[10px] font-black tracking-wider bg-green-400/10 px-2 py-0.5 rounded"
                                >
                                  ✓ VOTED
                                </motion.span>
                              )}
                              <motion.div 
                                className={`w-2 h-2 rounded-full transition-colors ${
                                  voteTally[p.id] ? 'bg-green-400' : 'bg-[#2e3060]'
                                }`}
                                animate={voteTally[p.id] ? {
                                  scale: [1, 1.3, 1],
                                  boxShadow: [
                                    "0 0 0px rgb(34, 197, 94)",
                                    "0 0 8px rgb(34, 197, 94)",
                                    "0 0 0px rgb(34, 197, 94)"
                                  ]
                                } : {}}
                                transition={{ duration: 0.6 }}
                              />
                            </div>
                          </motion.div>
                        ))}
                      </div>
                      
                      {/* Dead players */}
                      {deadPlayers.length > 0 && (
                        <div className="space-y-1.5 mt-4">
                          <p className="text-[#40405a] text-[9px] font-bold tracking-[0.15em] uppercase mb-2 px-1">
                            Dead ({deadPlayers.length})
                          </p>
                          {deadPlayers.map(p => (
                            <div key={p.id}
                              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#08091a] border border-[#141628] opacity-40"
                            >
                              <Crewmate color={p.color} size={22} dead />
                              <p className="text-[#40405a] text-xs line-through truncate">{p.name}</p>
                              <span className="text-[#40405a] text-[8px] font-bold">👻</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Enhanced Vote Panel using VotingPanel component ── */}
                  {showVotePanel && (
                    <motion.div 
                      key="vote" 
                      initial={{ opacity: 0, x: 20 }} 
                      animate={{ opacity: 1, x: 0 }} 
                      exit={{ opacity: 0, x: -20 }} 
                      className="space-y-3"
                    >
                      {/* Phase indicator */}
                      {isVotingPhase && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-center p-3 bg-green-500/10 border border-green-500/20 rounded-lg"
                        >
                          <p className="text-green-300 text-xs font-black uppercase tracking-widest">
                            🗳️ Voting Phase Active
                          </p>
                          <p className="text-[#9090b0] text-[10px] mt-1">
                            Cast your vote before time runs out!
                          </p>
                        </motion.div>
                      )}

                      {/* Use the enhanced VotingPanel component */}
                      <VotingPanel />
                      
                      {/* Global voting progress */}
                      {allVotesIn && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-center p-3 bg-[#e8c030]/10 border border-[#e8c030]/20 rounded-lg"
                        >
                          <p className="text-[#e8c030] text-xs font-black uppercase tracking-widest">
                            🎯 All Votes Cast!
                          </p>
                          <p className="text-[#9090b0] text-[10px] mt-1">
                            Calculating results...
                          </p>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
