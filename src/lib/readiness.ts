/**
 * readiness.ts — deterministic recovery/readiness scoring.
 *
 * Pure functions (no AI, no I/O) that turn recent recovery logs + session
 * history into a readiness score and a set of guardrails. The guardrails are
 * what the LLM session-builder must respect (see formAnalysis.generateAdaptivePlan).
 */

import type { DailyLog, Session, MuscleGroup } from '../types/index'

export type ReadinessBand = 'deload' | 'moderate' | 'push'

export interface Readiness {
  score:          number          // 0–100
  band:           ReadinessBand
  headline:       string
  factors:        string[]        // human-readable contributors, good and bad
  riskyExercises: string[]        // exercise ids trending high-risk recently
  soreMuscles:    MuscleGroup[]   // ease off these
  freshMuscles:   MuscleGroup[]   // prioritize these
}

const SORE_THRESHOLD = 3          // sorenessMap rating (0–5) at/above which a muscle is "sore"
const RISK_THRESHOLD = 50         // avg per-exercise risk (0–100) over recent sessions to flag

const TRAINABLE_MUSCLES: MuscleGroup[] =
  ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function computeReadiness(logs: DailyLog[], sessions: Session[]): Readiness {
  const log = [...logs].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  let score = 100
  const factors: string[] = []

  if (log) {
    if (log.sleepHours < 6)      { score -= 18; factors.push(`Short sleep (${log.sleepHours}h)`) }
    else if (log.sleepHours < 7) { score -= 8;  factors.push(`Light sleep (${log.sleepHours}h)`) }
    else                                          factors.push(`Solid sleep (${log.sleepHours}h)`)

    score -= (5 - log.sleepQuality) * 3
    score -= (log.overallSoreness - 1) * 7
    if (log.overallSoreness >= 4) factors.push('High overall soreness')

    score -= (5 - log.energyLevel) * 5
    if (log.energyLevel <= 2)      factors.push('Low energy')
    else if (log.energyLevel >= 4) factors.push('Good energy')

    if (log.rpe >= 8) { score -= 6; factors.push(`Hard recent session (RPE ${log.rpe})`) }
  } else {
    factors.push('No recovery log yet — log one for a sharper read')
  }

  // Cumulative fatigue: how many of the last 3 calendar days had a session.
  const trainedDays = new Set(sessions.map(s => s.date.slice(0, 10)))
  let recentDays = 0
  for (let i = 0; i < 3; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    if (trainedDays.has(ymd(d))) recentDays++
  }
  if (recentDays >= 3)      { score -= 14; factors.push('Trained 3 days straight') }
  else if (recentDays >= 2) { score -= 7;  factors.push('Back-to-back training days') }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const band: ReadinessBand = score >= 70 ? 'push' : score >= 45 ? 'moderate' : 'deload'

  // Per-exercise risk averaged over recent sessions.
  const riskAgg: Record<string, { sum: number; n: number }> = {}
  for (const s of sessions.slice(0, 8)) {
    for (const [ex, r] of Object.entries(s.exerciseRiskScores ?? {})) {
      const a = (riskAgg[ex] ??= { sum: 0, n: 0 })
      a.sum += r
      a.n += 1
    }
  }
  const riskyExercises = Object.entries(riskAgg)
    .filter(([, a]) => a.sum / a.n >= RISK_THRESHOLD)
    .sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n)
    .map(([ex]) => ex)

  const soreMuscles = log
    ? (Object.entries(log.sorenessMap)
        .filter(([, v]) => (v ?? 0) >= SORE_THRESHOLD)
        .map(([m]) => m as MuscleGroup))
    : []
  const freshMuscles = TRAINABLE_MUSCLES.filter(m => !soreMuscles.includes(m))

  const headline =
    band === 'push'     ? 'Primed — push today'
    : band === 'moderate' ? 'Moderate — train smart'
    :                       'Recover — keep it light'

  return { score, band, headline, factors: factors.slice(0, 4), riskyExercises, soreMuscles, freshMuscles }
}
