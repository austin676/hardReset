import { useState, useRef, useEffect, useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'

interface LocalMessage {
  id: number
  playerId: string
  name: string
  color: string
  message: string
  isMe: boolean
}

// Demo players shown when no real players are in store
const DEMO_PLAYERS = [
  { id: 'demo_2', name: 'Alex',   color: '#ff3366' },
  { id: 'demo_3', name: 'Jordan', color: '#00ff88' },
  { id: 'demo_4', name: 'Sam',    color: '#ffaa00' },
]

const DEMO_SEED: LocalMessage[] = [
  { id: 1, playerId: 'demo_2', name: 'Alex',   color: '#ff3366', message: 'I saw Jordan near Station 3 right before the sabotage', isMe: false },
  { id: 2, playerId: 'demo_3', name: 'Jordan', color: '#00ff88', message: "That's a lie, I was completing my task!",                isMe: false },
  { id: 3, playerId: 'demo_4', name: 'Sam',    color: '#ffaa00', message: 'Alex sus, been following me all round',                  isMe: false },
]

let msgCounter = 100

export default function ChatBox() {
  const { players, myPlayerId } = useGameStore()
  const { sendChatMessage } = useSocket()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<LocalMessage[]>(DEMO_SEED)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Resolve local identity — use store if available, else a stable demo identity
  const me = useMemo(() => {
    const stored = players.find((p) => p.id === myPlayerId)
    if (stored) return stored
    return { id: 'demo_me', name: 'You', color: '#00d4ff' }
  }, [players, myPlayerId])

  // Sync messages coming from Zustand (real socket events)
  const storeMessages = useGameStore((s) => s.chatMessages)
  useEffect(() => {
    storeMessages.forEach((sm) => {
      const alreadyAdded = messages.some(
        (m) => m.playerId === sm.playerId && m.message === sm.message
      )
      if (alreadyAdded) return
      const player = players.find((p) => p.id === sm.playerId)
      setMessages((prev) => [
        ...prev,
        {
          id: ++msgCounter,
          playerId: sm.playerId,
          name: player?.name ?? 'Player',
          color: player?.color ?? '#888',
          message: sm.message,
          isMe: sm.playerId === me.id,
        },
      ])
    })
  }, [storeMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const msg = input.trim()
    if (!msg) return

    // Optimistic local add
    setMessages((prev) => [
      ...prev,
      { id: ++msgCounter, playerId: me.id, name: me.name, color: me.color, message: msg, isMe: true },
    ])

    // Emit to socket when connected (real game)
    sendChatMessage(me.id, msg)
    setInput('')
  }

  return (
    <div className="bg-[#1a1c3a] border-4 border-[#2e3060] rounded-2xl flex flex-col h-full overflow-hidden
                    shadow-[0_4px_24px_#00000044]">
      <div className="px-4 py-3 border-b-2 border-[#2e3060] flex items-center justify-between">
        <h3 className="text-white font-black text-sm tracking-widest uppercase">💬 Chat</h3>
        <span className="text-[#40405a] font-bold text-xs">{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.isMe ? 'flex-row-reverse' : ''}`}>
            <div className="w-7 h-7 rounded-full flex-shrink-0 mt-1 border-2"
              style={{ backgroundColor: msg.color, borderColor: msg.color }} />
            <div className={`max-w-[80%] flex flex-col gap-0.5 ${msg.isMe ? 'items-end' : 'items-start'}`}>
              <span className="text-[#9090b0] text-xs font-black uppercase tracking-wide px-1">
                {msg.isMe ? 'You' : msg.name}
              </span>
              <div className={`px-3 py-2 rounded-xl text-sm text-white font-bold leading-relaxed
                              ${ msg.isMe
                                ? 'bg-[#1a3a8c] border-2 border-[#2040aa] rounded-tr-sm'
                                : 'bg-[#10122a] border-2 border-[#2e3060] rounded-tl-sm' }`}>
                {msg.message}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t-2 border-[#2e3060] flex gap-2">
        <input
          className="flex-1 bg-[#10122a] border-2 border-[#2e3060] text-white rounded-xl
                     px-3 py-2.5 text-sm font-bold focus:outline-none focus:border-[#e8c030]
                     transition-all placeholder:text-[#40405a]"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          maxLength={120}
        />
        <button onClick={handleSend} disabled={!input.trim()}
          className="bg-[#e8c030] text-[#10122a] rounded-xl px-4 font-black text-base
                     hover:bg-[#f0d040] transition-all active:scale-95
                     disabled:opacity-30 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>
    </div>
  )
}
