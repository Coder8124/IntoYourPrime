import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../stores/workoutStore'
import { generateCooldown } from '../lib/formAnalysis'
import type { UserProfile } from '../types/index'

export function SessionSummaryPage() {
  const navigate = useNavigate()
  const { repCounts, riskScores, warmupScore, setCooldownExercises } = useWorkoutStore()
  const [loading, setLoading] = useState(false)

  const userProfile = useMemo<UserProfile>(() => {
    try {
      const p = JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>
      return {
        uid:             typeof p.uid   === 'string' ? p.uid   : 'anonymous',
        email:           typeof p.email === 'string' ? p.email : '',
        displayName:     typeof p.name  === 'string' ? p.name  : 'Athlete',
        age:             Number(p.age)       || 25,
        weightKg:        Number(p.weight)    || 70,
        heightCm:        Number(p.height)    || 170,
        biologicalSex:   (p.biologicalSex as UserProfile['biologicalSex']) ?? 'other',
        fitnessLevel:    (typeof p.fitnessLevel === 'string' ? p.fitnessLevel : 'intermediate') as UserProfile['fitnessLevel'],
        createdAt:       new Date(),
        streakCount:     Number(p.streakCount) || 0,
        lastWorkoutDate: null,
      }
    } catch {
      return {
        uid: 'anonymous', email: '', displayName: 'Athlete',
        age: 25, weightKg: 70, heightCm: 170, biologicalSex: 'other',
        fitnessLevel: 'intermediate', createdAt: new Date(), streakCount: 0, lastWorkoutDate: null,
      }
    }
  }, [])

  async function handleStartCooldown() {
    setLoading(true)
    try {
      const exercises = await generateCooldown(
        { repCounts, avgRiskScore: riskScores.length ? Math.round(riskScores.reduce((a,b) => a+b,0) / riskScores.length) : 0 },
        userProfile,
      )
      setCooldownExercises(exercises.length ? exercises : FALLBACK_COOLDOWN)
    } catch {
      setCooldownExercises(FALLBACK_COOLDOWN)
    } finally {
      setLoading(false)
      navigate('/cooldown')
    }
  }

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

      <div className="flex gap-3 flex-wrap justify-center">
        <button
          onClick={handleStartCooldown}
          disabled={loading}
          className="px-6 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-60 rounded-xl font-bold text-sm text-white transition-all"
        >
          {loading ? 'Generating…' : 'Start Cooldown →'}
        </button>
        <Link
          to="/workout"
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm text-white btn-glow-blue transition-all"
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

const FALLBACK_COOLDOWN = [
  { name: 'Standing Quad Stretch',   durationSeconds: 30, targetMuscles: ['quadriceps'],        instruction: 'Stand on one leg, pull the other foot to your glutes. Hold 30 s each side.' },
  { name: 'Seated Hamstring Stretch', durationSeconds: 40, targetMuscles: ['hamstrings'],        instruction: 'Sit on the floor, legs straight. Reach toward your toes and hold.' },
  { name: 'Hip Flexor Lunge Stretch', durationSeconds: 30, targetMuscles: ['hip flexors'],       instruction: 'Kneel on one knee, push hips forward gently. 30 s each side.' },
  { name: 'Child\'s Pose',            durationSeconds: 45, targetMuscles: ['lower back', 'lats'], instruction: 'Kneel, sit back on heels, extend arms forward on the floor. Breathe deeply.' },
  { name: 'Doorway Chest Stretch',    durationSeconds: 30, targetMuscles: ['chest', 'shoulders'], instruction: 'Place forearms on a doorframe and lean forward until you feel a chest stretch.' },
]
