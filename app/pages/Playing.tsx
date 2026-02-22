import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import PlayerHUD from '../components/PlayerHUD'
import TaskModal from '../components/TaskModal'

export default function Playing() {
  const navigate   = useNavigate()
  const { callMeeting } = useSocket()

  const {
    myRole,
    myTasks,
    completedTaskIds,
    taskAttempts,
    taskModalOpen,
    activeTaskId,
    totalRoomTasks,
    roomCompletedTasks,
    gamePhase,
    myPlayerId,
    setTaskModal,
    players,
  } = useGameStore()

  // Navigate away when phase changes (meeting called or game ends)
  useEffect(() => {
    if (gamePhase === 'discussion' || gamePhase === 'ejection' || gamePhase === 'duel') navigate('/discussion')
    if (gamePhase === 'results') navigate('/results')
  }, [gamePhase, navigate])

  const activeTask = myTasks.find((t) => t.id === activeTaskId) ?? null
  const isImpostor = myRole === 'imposter'
  const progressPct = totalRoomTasks > 0
    ? Math.min(100, Math.round((roomCompletedTasks / totalRoomTasks) * 100))
    : 0

  const myPlayer = players.find((p) => p.id === myPlayerId)

  return (
    <div className="min-h-screen bg-[#0a0c1e] flex flex-col pb-24">
      {/* Top HUD bar */}
      <PlayerHUD />

      <div className="pt-16 px-4 flex flex-col gap-5 max-w-lg mx-auto w-full mt-4">

        {/* Role banner */}
        <motion.div
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`rounded-2xl border-4 px-5 py-4 flex items-center gap-4 ${
            isImpostor
              ? 'bg-[#e8101010] border-[#e81010]'
              : 'bg-[#1d8c3a10] border-[#1d8c3a]'
          }`}
        >
          <span className="text-3xl">{isImpostor ? '💣' : '👨‍🚀'}</span>
          <div>
            <p className={`font-black text-lg uppercase tracking-widest ${
              isImpostor ? 'text-[#e81010]' : 'text-[#1d8c3a]'
            }`}>
              {isImpostor ? 'Impostor' : 'Crewmate'}
            </p>
            <p className="text-[#9090b0] text-xs font-bold">
              {isImpostor
                ? 'Blend in — eliminate crewmates to win'
                : 'Complete your tasks before time runs out'}
            </p>
          </div>
        </motion.div>

        {/* Global task progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#9090b0] text-xs font-black uppercase tracking-widest">
              Team Progress
            </span>
            <span className="text-white text-xs font-black">
              {roomCompletedTasks} / {totalRoomTasks} tasks
            </span>
          </div>
          <div className="h-3 bg-[#1a1c3a] rounded-full border-2 border-[#2e3060] overflow-hidden">
            <motion.div
              className="h-full bg-[#1d8c3a] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-right text-[#40405a] text-xs mt-1 font-bold">{progressPct}%</p>
        </div>

        {/* Task list */}
        <div>
          <p className="text-[#9090b0] text-xs font-black uppercase tracking-widest mb-3">
            {isImpostor ? 'Cover Tasks' : 'Your Tasks'}
          </p>

          {myTasks.length === 0 ? (
            <div className="text-center text-[#5050708] font-bold py-8">
              No tasks assigned yet
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {myTasks.map((task, i) => {
                const done = completedTaskIds.includes(task.id)
                return (
                  <motion.button
                    key={task.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.08 }}
                    whileTap={{ scale: 0.97 }}
                    disabled={done}
                    onClick={() => setTaskModal(true, task.id)}
                    className={`w-full text-left rounded-2xl border-2 px-5 py-4 transition-all
                                flex items-center gap-4 ${
                      done
                        ? 'bg-[#1d8c3a18] border-[#1d8c3a] opacity-60 cursor-default'
                        : isImpostor
                        ? 'bg-[#1a1c3a] border-[#e8101040] hover:border-[#e81010] active:bg-[#1e1020]'
                        : 'bg-[#1a1c3a] border-[#2e3060] hover:border-[#5060b0] active:bg-[#151730]'
                    }`}
                  >
                    {/* Status dot */}
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                      done ? 'bg-[#1d8c3a] border-[#1d8c3a]' : 'border-[#40405a] bg-transparent'
                    }`}>
                      {done && <span className="flex items-center justify-center text-white text-xs leading-none">✓</span>}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`font-black text-sm truncate ${done ? 'text-[#1d8c3a]' : 'text-white'}`}>
                        {task.prompt.length > 70 ? task.prompt.slice(0, 70) + '…' : task.prompt}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[#9090b0] text-xs font-bold uppercase tracking-wide">
                          {task.domain}
                        </span>
                        <span className="text-[#40405a] text-xs">·</span>
                        <span className="text-[#9090b0] text-xs font-bold">
                          {task.language === 'python' ? '🐍 Python' : '🟨 JS'}
                        </span>
                        {(taskAttempts[task.id] ?? 0) > 0 && (
                          <>
                            <span className="text-[#40405a] text-xs">·</span>
                            <span className={`text-xs font-black ${
                              done ? 'text-[#1d8c3a]' : 'text-[#e8c030]'
                            }`}>
                              {taskAttempts[task.id]} attempt{taskAttempts[task.id] === 1 ? '' : 's'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {!done && (
                      <span className="text-[#40405a] font-black text-lg">›</span>
                    )}
                  </motion.button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Emergency Meeting button — fixed bottom (only during playing phase) */}
      {gamePhase === 'playing' && (
      <div className="fixed bottom-6 left-0 right-0 px-6 flex justify-center">
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => myPlayerId && callMeeting(myPlayerId)}
          className="w-full max-w-lg bg-[#e81010] hover:bg-[#ff2020] active:scale-95
                     text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl
                     border-4 border-[#901010] shadow-[0_6px_0_#601010]
                     hover:shadow-[0_3px_0_#601010] hover:translate-y-0.75 transition-all"
        >
          🚨 Emergency Meeting
        </motion.button>
      </div>
      )}

      {/* Task Modal */}
      {taskModalOpen && activeTask && (
        <TaskModal
          task={activeTask}
          onClose={() => setTaskModal(false)}
        />
      )}
    </div>
  )
}
