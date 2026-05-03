import type { MuscleGroup } from '../types'

/** Muscles used in the daily recovery log (prompt spec; excludes neck). */
export const RECOVERY_MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
] as const satisfies readonly MuscleGroup[]

export type RecoveryMuscle = (typeof RECOVERY_MUSCLE_GROUPS)[number]
