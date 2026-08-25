/**
 * quality.ts — Movement Quality, the replacement for the old "Injury Risk" score.
 *
 * The old number blended a local geometry heuristic with a vision-model opinion
 * and presented the result as though it predicted injury. It does not, and it
 * could not explain itself. Movement Quality measures what the pipeline can
 * actually observe — range, symmetry, control, pacing, joint alignment — and
 * every point of the final score traces back to a named factor.
 *
 * Higher is better, unlike the deviation scores it is built from.
 */

import type { SetMetrics } from './rep'

export type QualityBand = 'excellent' | 'solid' | 'fair' | 'poor'

export interface QualityFactor {
  key:    string
  label:  string
  /** 0–100, higher is better. */
  score:  number
  /** Relative contribution before renormalisation. */
  weight: number
}

export interface MovementQuality {
  /** 0–100, higher is better. */
  score:   number
  band:    QualityBand
  label:   string
  factors: QualityFactor[]
  /** The factor dragging the score down the most, if any is meaningfully weak. */
  weakest: QualityFactor | null
}

export interface QualityInput {
  set: SetMetrics | null
  /** Local landmark-geometry deviation, 0–100 higher is worse. Null when no clean read. */
  alignmentDeviation: number | null
  /** Vision-model form deviation, 0–100 higher is worse. Null when no analysis yet. */
  coachDeviation: number | null
}

/** A factor at or below this is worth calling out as the limiting one. */
const WEAK_THRESHOLD = 70

function band(score: number): QualityBand {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'solid'
  if (score >= 50) return 'fair'
  return 'poor'
}

const BAND_LABEL: Record<QualityBand, string> = {
  excellent: 'Excellent',
  solid:     'Solid',
  fair:      'Fair',
  poor:      'Breaking down',
}

/**
 * ROM is scored against a target rather than linearly: a rep that uses 80%+ of
 * the calibrated range is full-range as far as this pipeline can tell, and the
 * calibration itself comes from the user's own movement.
 */
function romScore(avgRomPct: number): number {
  return Math.max(0, Math.min(100, Math.round((avgRomPct / 80) * 100)))
}

export function computeMovementQuality(input: QualityInput): MovementQuality {
  const { set, alignmentDeviation, coachDeviation } = input
  const factors: QualityFactor[] = []

  if (set) {
    factors.push({ key: 'rom', label: 'Range of motion', score: romScore(set.avgRomPct), weight: 25 })
    factors.push({ key: 'stability', label: 'Control', score: set.avgStability, weight: 15 })
    factors.push({ key: 'consistency', label: 'Consistency', score: set.consistency, weight: 10 })
    if (set.avgSymmetry !== null) {
      factors.push({ key: 'symmetry', label: 'Symmetry', score: set.avgSymmetry, weight: 15 })
    }
  }
  if (alignmentDeviation !== null) {
    factors.push({ key: 'alignment', label: 'Joint alignment', score: 100 - alignmentDeviation, weight: 20 })
  }
  if (coachDeviation !== null) {
    factors.push({ key: 'coach', label: 'Coach review', score: 100 - coachDeviation, weight: 25 })
  }

  if (!factors.length) {
    return { score: 0, band: 'fair', label: 'Measuring…', factors: [], weakest: null }
  }

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight,
  )

  const weakest = factors.reduce<QualityFactor | null>(
    (worst, f) => (f.score < WEAK_THRESHOLD && (!worst || f.score < worst.score) ? f : worst),
    null,
  )

  const b = band(score)
  return { score, band: b, label: BAND_LABEL[b], factors, weakest }
}

export function qualityColor(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 50) return '#f59e0b'
  return '#ef4444'
}
