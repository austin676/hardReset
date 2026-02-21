import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useSocket } from '../hooks/useSocket'

type Direction = 'up' | 'down' | 'left' | 'right' | 'idle'

export default function Controller() {
  const { sendControllerInput } = useSocket()
  const [activeDir, setActiveDir] = useState<Direction>('idle')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const startInput = (dir: Direction) => {
    setActiveDir(dir)
    sendControllerInput(dir)
    intervalRef.current = setInterval(() => sendControllerInput(dir), 100)
  }
  const stopInput = () => {
    setActiveDir('idle')
    sendControllerInput('idle')
    if (intervalRef.current) clearInterval(intervalRef.current)
  }
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  const DPadBtn = ({ dir, label, span = '' }: { dir: Direction; label: string; span?: string }) => (
    <motion.button
      onPointerDown={() => startInput(dir)}
      onPointerUp={stopInput} onPointerLeave={stopInput}
      whileTap={{ scale: 0.88 }}
      className={`h-16 rounded-xl font-black text-2xl flex items-center justify-center
                  border-4 select-none transition-colors ${span}
                  ${ activeDir === dir
                    ? 'bg-[#e8c030] border-[#c8a020] text-[#10122a]'
                    : 'bg-[#1a1c3a] border-[#2e3060] text-[#9090b0]' }`}
    >
      {label}
    </motion.button>
  )

  return (
    <div className="min-h-screen bg-[#10122a] flex flex-col items-center justify-center gap-10
                    select-none touch-none px-8">
      {/* Header */}
      <div className="text-center">
        <p className="text-[#e8c030] font-black text-xs tracking-widest uppercase mb-1">Mobile</p>
        <h1 className="text-white font-black text-3xl tracking-widest uppercase">Controller</h1>
      </div>

      {/* D-Pad */}
      <div className="grid grid-cols-3 gap-3 w-56">
        <div />
        <DPadBtn dir="up" label="↑" />
        <div />
        <DPadBtn dir="left" label="←" />
        <div className="h-16 rounded-xl bg-[#10122a] border-4 border-dashed border-[#2e3060]" />
        <DPadBtn dir="right" label="→" />
        <div />
        <DPadBtn dir="down" label="↓" />
        <div />
      </div>

      {/* Action buttons */}
      <div className="flex gap-6">
        <motion.button
          whileTap={{ scale: 0.88 }}
          onPointerDown={() => sendControllerInput('idle', 'interact')}
          className="w-24 h-24 rounded-full bg-[#1d8c3a] text-white font-black text-sm
                     border-4 border-[#0d5020] shadow-[0_6px_0_#0d5020] uppercase tracking-wide
                     active:shadow-[0_2px_0_#0d5020] active:translate-y-[4px] transition-all"
        >
          Use
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onPointerDown={() => sendControllerInput('idle', 'meeting')}
          className="w-24 h-24 rounded-full bg-[#e81010] text-white font-black text-xs
                     border-4 border-[#901010] shadow-[0_6px_0_#901010] uppercase tracking-wide
                     active:shadow-[0_2px_0_#901010] active:translate-y-[4px] transition-all"
        >
          Report
        </motion.button>
      </div>

      <p className="text-[#40405a] text-xs font-bold tracking-widest uppercase">
        Keep this page open on mobile
      </p>
    </div>
  )
}
