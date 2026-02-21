interface ActivityLogProps { entries: string[] }

export default function ActivityLog({ entries }: ActivityLogProps) {
  if (!entries.length)
    return <p className="text-[#40405a] font-black text-xs text-center py-3 uppercase tracking-widest">No activity to report</p>

  return (
    <div className="bg-[#10122a] border-2 border-[#2e3060] rounded-xl p-4 space-y-2 max-h-40 overflow-y-auto">
      <p className="text-[#9090b0] font-black text-xs uppercase tracking-widest mb-3">Activity Log</p>
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="text-[#2e3060] font-black text-xs flex-shrink-0 mt-0.5">
            {String(i + 1).padStart(2, '0')}
          </span>
          <p className="text-[#c0c0e0] font-bold text-xs leading-relaxed">{entry}</p>
        </div>
      ))}
    </div>
  )
}
