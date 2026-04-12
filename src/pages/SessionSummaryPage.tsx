import { Link } from 'react-router-dom'
import { useWorkoutStore } from '../stores/workoutStore'

export function SessionSummaryPage() {
  const { repCounts, riskScores, warmupScore } = useWorkoutStore()

  const totalReps  = Object.values(repCounts).reduce((a, b) => a + b, 0)
  const avgRisk    = riskScores.length
    ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length)
    : 0

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-6 text-white px-6">
      <div className="text-5xl">🏁</div>
      <h1 className="text-3xl font-black tracking-tight">Session Complete</h1>

      <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
        {[
          { label: 'Total Reps',    value: totalReps },
          { label: 'Avg Risk',      value: avgRisk },
          { label: 'Warmup Score',  value: warmupScore ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="card-surface p-4 flex flex-col items-center gap-1">
            <span className="text-2xl font-black text-blue-400">{value}</span>
            <span className="text-[11px] text-gray-500 text-center">{label}</span>
          </div>
        ))}
      </div>

      {Object.keys(repCounts).length > 0 && (
        <div className="card-surface p-5 w-full max-w-sm space-y-2">
          <p className="text-[11px] font-bold tracking-widest uppercase text-gray-500 mb-3">Reps by Exercise</p>
          {Object.entries(repCounts).map(([ex, count]) => (
            <div key={ex} className="flex justify-between text-sm">
              <span className="capitalize text-gray-300">{ex}</span>
              <span className="font-black text-white">{count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Link
          to="/workout"
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm btn-glow-blue transition-all"
        >
          New Session
        </Link>
        <Link
          to="/home"
          className="px-6 py-3 border border-[#2e2e3e] text-gray-400 rounded-xl font-semibold text-sm hover:text-white transition-all"
        >
          Home
        </Link>
      </div>
    </div>
  )
}
