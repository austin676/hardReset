import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { submitCode, runCode } from '../lib/puzzleService'
import type { Task } from '../lib/puzzleService'
import { useSocket } from '../hooks/useSocket'
import { useGameStore } from '../store/gameStore'

interface Props {
  task: Task
  onClose: () => void
}

export default function TaskModal({ task, onClose }: Props) {
  const [code, setCode] = useState(task.starterCode)
  const [status, setStatus] = useState<'idle' | 'running' | 'passed' | 'failed'>('idle')
  const [feedback, setFeedback] = useState<string | null>(null)

  const { emitTaskComplete, emitRecordAttempt } = useSocket()
  const { roomCode, setTaskModal, markTaskDone, incrementAttempt } = useGameStore()

  const handleSubmit = async () => {
    if (status === 'running') return
    setStatus('running')
    setFeedback(null)

    try {
      // Run via expectedOutput (LLM tasks) or by taskId (static tasks)
      const result = task.expectedOutput !== undefined
        ? await runCode(task.language, code, task.expectedOutput)
        : await submitCode(task.id, task.language, code)

      // Always record the attempt to backend (for AI report)
      if (roomCode) emitRecordAttempt(roomCode, task.id, result.passed, code)
      incrementAttempt(task.id)

      if (result.passed) {
        setStatus('passed')
        markTaskDone(task.id)
        if (roomCode) emitTaskComplete(roomCode, task.id)
        setTimeout(() => {
          setTaskModal(false)
          onClose()
        }, 1500)
      } else {
        setStatus('failed')
        const got = result.stdout ? `Got: "${result.stdout}"` : ''
        const err = result.stderr ? `\nError: ${result.stderr}` : ''
        setFeedback(`❌ Wrong output. ${got}${err}`)
      }
    } catch (err: any) {
      setStatus('failed')
      setFeedback(`⚠️ ${err.message}`)
    }
  }

  const langLabel = task.language === 'python' ? '🐍 Python' : '🟨 JavaScript'
  const domainLabel = task.domain.toUpperCase()

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          className="w-full max-w-2xl bg-[#10122a] border-4 border-[#2e3060] rounded-2xl
                     flex flex-col max-h-[90vh] overflow-hidden shadow-[0_8px_60px_#00000088]"
          initial={{ scale: 0.92, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 24, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b-4 border-[#2e3060]">
            <div className="flex items-center gap-3">
              <span className="bg-[#1a1c3a] border-2 border-[#2e3060] text-[#9090b0] text-xs
                               font-black tracking-widest uppercase px-3 py-1 rounded-lg">
                {domainLabel}
              </span>
              <span className="text-[#9090b0] text-xs font-black tracking-widest">{langLabel}</span>
            </div>
            <button
              onClick={onClose}
              className="text-[#5050708] hover:text-white transition-colors text-2xl font-black leading-none"
            >
              ✕
            </button>
          </div>

          {/* Prompt */}
          <div className="px-6 py-4 border-b-2 border-[#1a1c3a]">
            <p className="text-white font-bold text-sm leading-relaxed">{task.prompt}</p>
          </div>

          {/* Code editor */}
          <div className="flex-1 overflow-hidden px-4 py-3">
            <textarea
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                if (status !== 'idle') setStatus('idle')
              }}
              spellCheck={false}
              className="w-full h-full min-h-[220px] bg-[#0a0c1e] border-2 border-[#1a1c3a]
                         text-[#c0d0ff] font-mono text-sm p-4 rounded-xl resize-none
                         focus:outline-none focus:border-[#5060b0] transition-all
                         leading-relaxed"
              style={{ tabSize: 4 }}
              onKeyDown={(e) => {
                // Allow Tab to insert spaces instead of losing focus
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const start = e.currentTarget.selectionStart
                  const end   = e.currentTarget.selectionEnd
                  setCode(code.substring(0, start) + '    ' + code.substring(end))
                  requestAnimationFrame(() => {
                    e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 4
                  })
                }
              }}
            />
          </div>

          {/* Feedback */}
          {feedback && (
            <div className="mx-4 mb-2 px-4 py-2 rounded-lg bg-[#e8101015] border-2 border-[#e81010]
                            text-[#ff6060] font-mono text-xs whitespace-pre-wrap">
              {feedback}
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t-2 border-[#1a1c3a] flex items-center gap-4">
            <motion.button
              onClick={handleSubmit}
              disabled={status === 'running' || status === 'passed'}
              whileTap={{ scale: 0.95 }}
              className={`flex-1 py-3 rounded-xl font-black text-sm uppercase tracking-widest
                         border-2 transition-all ${
                           status === 'passed'
                             ? 'bg-[#1d8c3a] border-[#1d8c3a] text-white'
                             : status === 'running'
                             ? 'bg-[#1a1c3a] border-[#2e3060] text-[#5050708] cursor-wait'
                             : status === 'failed'
                             ? 'bg-[#e8101015] border-[#e81010] text-[#e81010] hover:bg-[#e8101030]'
                             : 'bg-[#1d8c3a] border-[#0d5020] text-white hover:bg-[#22a844]'
                         }`}
            >
              {status === 'running' ? '⏳ Running...'
               : status === 'passed' ? '✅ Passed!'
               : status === 'failed' ? '🔄 Try Again'
               : '▶ Run & Submit'}
            </motion.button>

            <button
              onClick={onClose}
              className="px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest
                         bg-[#1a1c3a] border-2 border-[#2e3060] text-[#9090b0]
                         hover:border-[#5050708] transition-all"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
