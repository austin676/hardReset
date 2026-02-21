import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import MeetingPopup from '../components/MeetingPopup'
import ChatBox from '../components/ChatBox'
import VotingPanel from '../components/VotingPanel'
import EjectionScreen from '../components/EjectionScreen'

export default function Discussion() {
  const { gamePhase } = useGameStore()
  useSocket()

  if (gamePhase === 'ejection') return <EjectionScreen />

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
