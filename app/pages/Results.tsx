import { useState } from 'react'
import EndScreen from '../components/EndScreen'
import AIReport from '../components/AIReport'

export default function Results() {
  const [view, setView] = useState<'stats' | 'report'>('stats')

  return (
    <div className="min-h-screen bg-[#10122a] px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex gap-1 bg-[#1a1c3a] rounded-xl p-1 border-4 border-[#2e3060]">
          {(['stats', 'report'] as const).map((tab) => (
            <button key={tab} onClick={() => setView(tab)}
              className={`flex-1 py-3 rounded-lg font-black text-sm transition-all uppercase tracking-widest ${
                view === tab
                  ? 'bg-[#e8c030] text-[#10122a] shadow-[0_2px_8px_#e8c03044]'
                  : 'text-[#9090b0] hover:text-white'
              }`}
            >
              {tab === 'stats' ? '🏆 Game Stats' : '🤖 AI Report'}
            </button>
          ))}
        </div>
        {view === 'stats' ? <EndScreen /> : <AIReport />}
      </div>
    </div>
  )
}
