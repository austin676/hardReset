import { motion } from 'framer-motion'
import { useGameStore } from '../store/gameStore'

export default function AIReport() {
  const { aiReports, myPlayerId } = useGameStore()
  const report = myPlayerId ? aiReports[myPlayerId] : null

  if (!report) {
    return (
      <div className="bg-[#1a1c3a] border-4 border-[#2e3060] rounded-2xl p-8 text-center space-y-3">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="text-4xl inline-block">🤖</motion.div>
        <p className="text-[#9090b0] font-black text-sm uppercase tracking-widest">
          Claude is generating your report...
        </p>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#1a1c3a] border-4 border-[#2e3060] rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-5 pb-4 border-b-2 border-[#2e3060]">
        <span className="text-2xl">🤖</span>
        <h3 className="text-[#e8c030] font-black text-lg tracking-widest uppercase">AI Performance Report</h3>
      </div>
      <div className="text-[#c0c0e0] font-bold text-sm leading-relaxed space-y-2 whitespace-pre-wrap">
        {report.split('\n').map((line, i) => {
          if (line.startsWith('## '))
            return <h2 key={i} className="text-white font-black text-base mt-4 uppercase tracking-wide">{line.replace('## ', '')}</h2>
          if (line.startsWith('### '))
            return <h3 key={i} className="text-[#e8c030] font-black mt-3 uppercase tracking-wide">{line.replace('### ', '')}</h3>
          if (line.startsWith('**') && line.endsWith('**'))
            return <p key={i} className="text-white font-black">{line.replace(/\*\*/g, '')}</p>
          if (line.startsWith('- '))
            return <li key={i} className="list-none pl-4 before:content-['>'] before:mr-2 before:text-[#e8c030] font-bold">{line.replace('- ', '')}</li>
          return <p key={i}>{line}</p>
        })}
      </div>
    </motion.div>
  )
}
