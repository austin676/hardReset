import { useGameStore } from '../store/gameStore'

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function PlayerHUD() {
  const { timeLeft, roundNumber, players, myPlayerId, myRole, gamePhase } = useGameStore()
  const myPlayer = players.find((p) => p.id === myPlayerId)
  const isUrgent = timeLeft <= 30
  if (gamePhase !== 'playing') return null

  return (
    <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between
                    px-5 py-2.5 bg-[#10122a] border-b-4 border-[#2e3060]
                    shadow-[0_4px_20px_#00000066]">
      {/* Round */}
      <div className="flex items-center gap-2">
        <span className="text-[#9090b0] font-black text-xs uppercase tracking-widest">Round</span>
        <span className="text-white font-black text-xl">{roundNumber}</span>
        <span className="text-[#40405a] font-black text-sm">/3</span>
      </div>

      {/* Timer */}
      <div className={`font-black text-3xl tracking-wider ${
        isUrgent ? 'text-[#e81010] animate-pulse' : 'text-[#e8c030]'
      }`}>
        {formatTime(timeLeft)}
      </div>

      {/* Role badge */}
      <div className="flex items-center gap-2">
        {myPlayer && (
          <div className="w-6 h-6 rounded-full border-2"
            style={{ backgroundColor: myPlayer.color, borderColor: myPlayer.color }} />
        )}
        <span className={`font-black text-xs px-3 py-1.5 rounded-lg border-2 uppercase tracking-widest ${
          myRole === 'imposter'
            ? 'bg-[#e8101015] border-[#e81010] text-[#e81010]'
            : 'bg-[#1d8c3a15] border-[#1d8c3a] text-[#1d8c3a]'
        }`}>
          {myRole === 'imposter' ? '💣 Impostor' : '👨‍🚀 Crewmate'}
        </span>
      </div>
    </div>
  )
}
