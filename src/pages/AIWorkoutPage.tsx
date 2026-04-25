import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EXERCISE_INFO, saveCustomProgram, type WorkoutProgram } from '../lib/programs'
import { BottomNav } from '../components/BottomNav'

function getApiKey(): string {
  try {
    const stored = localStorage.getItem('formAI_openai_key')?.trim()
    if (stored) return stored
  } catch { /* ignore */ }
  return (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? ''
}

const EXERCISE_LIST = EXERCISE_INFO.map(e => `${e.id} (${e.name})`).join(', ')

async function generateProgram(goal: string, apiKey: string): Promise<WorkoutProgram> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a personal trainer. Create a workout program as JSON matching this TypeScript interface:
{
  name: string,
  description: string,
  level: "Beginner" | "Intermediate" | "Advanced",
  exercises: string[],  // exercise IDs from the allowed list only
  targetReps: number,   // reps per exercise (8-20)
  targetHoldSecs: number, // seconds for hold exercises (20-60)
  tags: string[]
}
Only use exercise IDs from this list: ${EXERCISE_LIST}
Pick 4-8 exercises relevant to the user's goal. Return ONLY the JSON object.`,
        },
        { role: 'user', content: `Goal: ${goal}` },
      ],
    }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  const parsed = JSON.parse(data.choices[0].message.content) as Partial<WorkoutProgram>
  // Validate exercise IDs
  const validIds = new Set(EXERCISE_INFO.map(e => e.id))
  const exercises = (parsed.exercises ?? []).filter(id => validIds.has(id))
  if (exercises.length === 0) throw new Error('No valid exercises returned')
  return {
    id: `ai-${Date.now()}`,
    name: parsed.name ?? 'AI Program',
    description: parsed.description ?? goal,
    level: parsed.level ?? 'Intermediate',
    duration: `${Math.ceil(exercises.length * 2.5)} min`,
    exercises,
    tags: [...(parsed.tags ?? []), 'AI Generated'],
    emoji: '🤖',
    targetReps: parsed.targetReps ?? 12,
    targetHoldSecs: parsed.targetHoldSecs ?? 30,
  }
}

const SUGGESTIONS = [
  'Build upper body strength in 4 weeks',
  'Lose weight with high-intensity cardio',
  'Improve core stability and posture',
  'Beginner full body routine, 3 days/week',
  'Build arm and shoulder size',
  'Athletic conditioning for a basketball player',
]

export function AIWorkoutPage() {
  const navigate = useNavigate()
  const [goal,    setGoal]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [preview, setPreview] = useState<WorkoutProgram | null>(null)

  const apiKey = getApiKey()

  const handleGenerate = async () => {
    if (!goal.trim() || !apiKey) return
    setLoading(true)
    setError(null)
    setPreview(null)
    try {
      const program = await generateProgram(goal.trim(), apiKey)
      setPreview(program)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate program')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = () => {
    if (!preview) return
    saveCustomProgram(preview)
    navigate('/programs')
  }

  return (
    <div className="min-h-screen bg-page text-white pb-24">
      <header className="sticky top-0 z-10 bg-[#0d0d18]/90 backdrop-blur border-b border-[#1e1e2e] px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link to="/programs" className="text-sm font-semibold text-blue-400 hover:text-blue-300">← Programs</Link>
          <div className="w-px h-4 bg-[#1e1e2e]" />
          <h1 className="font-black text-white tracking-tight">AI Workout Generator</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">

        {!apiKey && (
          <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/8">
            <p className="text-[13px] text-amber-300 font-semibold mb-1">OpenAI API key required</p>
            <p className="text-[12px] text-amber-200/70">
              Add your key in{' '}
              <Link to="/profile" className="underline underline-offset-2 hover:text-amber-200">Profile → API Key</Link>
              {' '}to use AI generation.
            </p>
          </div>
        )}

        {/* Goal input */}
        <div className="rounded-2xl bg-[#0d0d18] border border-[#1e1e2e] p-5 space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Describe your goal</p>
          <textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="e.g. I want to build upper body strength and improve my posture…"
            rows={3}
            disabled={!apiKey}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder-gray-600 outline-none resize-none disabled:opacity-40"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-2)' }}
          />
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setGoal(s)}
                disabled={!apiKey}
                className="px-3 py-1.5 rounded-full text-[11px] text-gray-400 border border-[#2a2a42] hover:border-blue-500/50 hover:text-blue-300 transition-colors disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!goal.trim() || !apiKey || loading}
            className="w-full py-3 rounded-xl font-bold text-[14px] text-white transition-colors disabled:opacity-40"
            style={{ background: '#3b82f6', boxShadow: '0 0 20px rgba(59,130,246,0.3)' }}
          >
            {loading ? '🤖 Generating…' : '✨ Generate Program'}
          </button>
          {error && <p className="text-[12px] text-red-400">{error}</p>}
        </div>

        {/* Preview */}
        {preview && (
          <div className="rounded-2xl bg-[#0d0d18] border border-blue-500/30 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-[32px] leading-none">🤖</span>
              <div className="flex-1">
                <h3 className="font-black text-white text-[16px]">{preview.name}</h3>
                <p className="text-[12px] text-gray-400 mt-0.5">{preview.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd' }}>
                    {preview.level}
                  </span>
                  {preview.tags.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-full text-[11px] text-gray-600 border border-[#1e1e2e]">{t}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {preview.exercises.map((id, i) => {
                const info = EXERCISE_INFO.find(e => e.id === id)
                return (
                  <div key={id} className="flex items-center gap-3 p-2.5 rounded-xl bg-page border border-[#1a1a2a]">
                    <span className="text-[12px] font-black text-blue-600/50 w-5 shrink-0">{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-white">{info?.name ?? id}</p>
                      {info && <p className="text-[11px] text-gray-600">{info.muscles.slice(0, 3).join(' · ')}</p>}
                    </div>
                    <span className="text-[11px] text-gray-500">
                      {info?.isHold ? `${preview.targetHoldSecs}s` : `${preview.targetReps} reps`}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-[14px] font-black text-white transition-colors"
                style={{ boxShadow: '0 0 20px rgba(59,130,246,0.3)' }}
              >
                Save & Use Program →
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={loading}
                className="px-4 py-3 rounded-xl border border-[#2e2e3e] text-[13px] font-semibold text-gray-400 hover:text-white transition-colors disabled:opacity-40"
              >
                Regenerate
              </button>
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
