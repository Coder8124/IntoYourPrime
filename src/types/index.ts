// ── User ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid:          string
  name:         string
  age:          number
  weight:       number       // kg
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced'
  goals?:       string[]
}

// ── Form analysis ──────────────────────────────────────────────────────────

export interface FormAnalysisResult {
  riskScore:         number          // 0–100
  suggestions:       string[]        // 2–3 coach cues
  safetyConcerns:    string[]        // empty if none
  repCountEstimate:  number
  dominantIssue:     string | null   // biggest form problem, null if good
  warmupQuality:     number | null   // 0–100, warmup phase only
}

// ── Cooldown ───────────────────────────────────────────────────────────────

export interface CooldownExercise {
  name:          string
  duration:      number              // seconds
  targetMuscles: string[]
  instructions:  string              // 1–2 sentences
  priority:      'high' | 'medium' | 'low'
}

// ── Session ────────────────────────────────────────────────────────────────

export interface Session {
  id:            string
  uid:           string
  exercise:      string
  phase:         'warmup' | 'main'
  repCount:      number
  durationSec:   number
  riskScores:    number[]            // sampled throughout session
  formAnalyses:  FormAnalysisResult[]
  completedAt:   number              // epoch ms
  notes?:        string
}

// ── Recovery logging ───────────────────────────────────────────────────────

export interface DailyLog {
  id:            string
  uid:           string
  date:          string              // ISO date "YYYY-MM-DD"
  sleepHours:    number
  sleepQuality:  number              // 1–5
  soreness:      Record<string, number>  // muscle group → 1–5
  energyLevel:   number              // 1–5
  rpe:           number              // 0–10, rate of perceived exertion
  notes?:        string
  loggedAt:      number              // epoch ms
}
