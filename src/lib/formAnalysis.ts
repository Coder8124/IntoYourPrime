import type { FormAnalysisResult, CooldownExercise, Session, DailyLog, UserProfile } from '../types/index'

// ── Types ──────────────────────────────────────────────────────────────────

interface AnalyzeParams {
  frames:      string[]                            // base64 data URLs
  exercise:    string
  repCount:    number
  userProfile: { age: number; weight: number; fitnessLevel: string }
  phase:       'warmup' | 'main'
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_FORM_RESULT: FormAnalysisResult = {
  riskScore:        0,
  suggestions:      [],
  safetyConcerns:   [],
  repCountEstimate: 0,
  dominantIssue:    null,
  warmupQuality:    null,
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── analyzeForm ────────────────────────────────────────────────────────────

export async function analyzeForm(params: AnalyzeParams): Promise<FormAnalysisResult> {
  const body = {
    frames:      params.frames,
    exercise:    params.exercise,
    repCount:    params.repCount,
    userProfile: params.userProfile,
    phase:       params.phase,
  }

  // First attempt
  try {
    return await postJson<FormAnalysisResult>('/api/analyze', body)
  } catch {
    // Single retry after 500 ms on network failure
    await sleep(500)
  }

  // Retry attempt
  try {
    return await postJson<FormAnalysisResult>('/api/analyze', body)
  } catch {
    return { ...DEFAULT_FORM_RESULT, repCountEstimate: params.repCount }
  }
}

// ── generateCooldown ───────────────────────────────────────────────────────

export async function generateCooldown(
  session:     Partial<Session>,
  userProfile: UserProfile,
): Promise<CooldownExercise[]> {
  try {
    return await postJson<CooldownExercise[]>('/api/cooldown', { session, userProfile })
  } catch {
    return []
  }
}

// ── generateRecoveryInsight ────────────────────────────────────────────────

export async function generateRecoveryInsight(context: {
  sessions: Session[]
  logs:     DailyLog[]
}): Promise<string> {
  try {
    const result = await postJson<{ insight: string }>('/api/recovery-insight', context)
    return result.insight
  } catch {
    return ''
  }
}
