import { Timestamp } from 'firebase/firestore'
import type { DocumentData as FirestoreDocumentData } from 'firebase/firestore'

/** Matches `firebase.firestore.DocumentData` from the namespaced API; use with modular Firestore reads. */
// eslint-disable-next-line @typescript-eslint/no-namespace -- public API shape requested as FirebaseFirestore.DocumentData
export namespace FirebaseFirestore {
  export type DocumentData = FirestoreDocumentData
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'neck'

export type WorkoutPhase = 'idle' | 'warmup' | 'main' | 'cooldown' | 'complete'

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  age: number
  weightKg: number
  heightCm: number
  biologicalSex: 'male' | 'female' | 'other'
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced'
  createdAt: Date
  streakCount: number
  lastWorkoutDate: string | null
  avgWorkoutScore?: number
  totalSessions?: number
  badges?: string[]
  weeklyProgress?: { week: string; challengeId: string; value: number; completed: boolean }
}

export interface CooldownExercise {
  name: string
  durationSeconds: number
  targetMuscles: string[]
  instruction: string
}

export interface Session {
  id: string
  userId: string
  date: string
  exercises: string[]
  durationMinutes: number
  warmupScore: number
  warmupDurationMinutes: number
  avgRiskScore: number
  peakRiskScore: number
  repCounts: Record<string, number>
  exerciseRiskScores?: Record<string, number>
  formSuggestions: string[]
  cooldownCompleted: boolean
  cooldownExercises: CooldownExercise[]
  feelRating: number | null
  totalRiskEvents: number
  workoutScore?: number
  exerciseWeights?: Record<string, number>
}

export interface DailyLog {
  id: string
  userId: string
  date: string
  sleepHours: number
  sleepQuality: 1 | 2 | 3 | 4 | 5
  energyLevel: 1 | 2 | 3 | 4 | 5
  mood: 1 | 2 | 3 | 4 | 5
  overallSoreness: 1 | 2 | 3 | 4 | 5
  sorenessMap: Partial<Record<MuscleGroup, number>>
  rpe: number
  trainingType: string
  notes: string
}

export interface FriendConnection {
  id: string
  userId: string
  friendId: string
  friendDisplayName: string
  friendEmail: string
  status: 'pending' | 'accepted'
  sharedStreak: number
  lastSharedWorkoutDate: string | null
  createdAt: Date
}

export interface ActivityFeedItem {
  id: string
  userId: string
  displayName: string
  type: 'workout_completed' | 'streak_milestone' | 'friend_joined'
  sessionId?: string
  warmupScore?: number
  avgRiskScore?: number
  streak?: number
  timestamp: Date
}

export interface FormAnalysisResult {
  riskScore: number
  suggestions: string[]
  safetyConcerns: string[]
  repCountEstimate: number
  dominantIssue: string | null
  /** Populated by `/api/analyze` during warmup phase; otherwise null. */
  warmupQuality?: number | null
}

const MUSCLE_GROUPS = new Set<MuscleGroup>([
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
  'neck',
])

function isTimestamp(value: unknown): value is Timestamp {
  return value instanceof Timestamp
}

function serializeForFirestore(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value instanceof Date) return Timestamp.fromDate(value)
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => serializeForFirestore(item))
      .filter((item) => item !== undefined)
  }
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue
    const next = serializeForFirestore(v)
    if (next !== undefined) out[key] = next
  }
  return out
}

function readString(value: unknown, field: string): string {
  if (typeof value === 'string') return value
  throw new Error(`fromFirestore: expected string for ${field}`)
}

function readIsoLike(value: unknown, field: string): string {
  if (typeof value === 'string') return value
  if (isTimestamp(value)) return value.toDate().toISOString()
  throw new Error(`fromFirestore: expected ISO string or Timestamp for ${field}`)
}

function readNumber(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new Error(`fromFirestore: expected finite number for ${field}`)
}

function readIntInRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const n = readNumber(value, field)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`fromFirestore: expected integer ${min}–${max} for ${field}`)
  }
  return n
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value
  throw new Error(`fromFirestore: expected boolean for ${field}`)
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`fromFirestore: expected string[] for ${field}`)
  }
  return value.map((item, i) => {
    if (typeof item !== 'string') {
      throw new Error(`fromFirestore: expected string at ${field}[${i}]`)
    }
    return item
  })
}

function readRecordStringNumber(
  value: unknown,
  field: string,
): Record<string, number> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`fromFirestore: expected object map for ${field}`)
  }
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`fromFirestore: expected number values in ${field}.${k}`)
    }
    out[k] = v
  }
  return out
}

function readCooldownExercise(value: unknown, index: number): CooldownExercise {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`fromFirestore: expected CooldownExercise at cooldownExercises[${index}]`)
  }
  const o = value as Record<string, unknown>
  return {
    name: readString(o.name, `cooldownExercises[${index}].name`),
    durationSeconds: readNumber(o.durationSeconds, `cooldownExercises[${index}].durationSeconds`),
    targetMuscles: readStringArray(o.targetMuscles, `cooldownExercises[${index}].targetMuscles`),
    instruction: readString(o.instruction, `cooldownExercises[${index}].instruction`),
  }
}

function readCooldownExercises(value: unknown): CooldownExercise[] {
  if (!Array.isArray(value)) {
    throw new Error('fromFirestore: expected cooldownExercises array')
  }
  return value.map((item, i) => readCooldownExercise(item, i))
}

function readFeelRating(value: unknown): number | null {
  if (value === null) return null
  return readIntInRange(value, 'feelRating', 1, 5)
}

function readYyyyMmDd(value: unknown, field: string): string {
  const raw = readIsoLike(value, field)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (raw.length >= 10 && raw[4] === '-' && raw[7] === '-') return raw.slice(0, 10)
  throw new Error(`fromFirestore: expected YYYY-MM-DD (or parseable ISO) for ${field}`)
}

function readSorenessMap(value: unknown): Partial<Record<MuscleGroup, number>> {
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('fromFirestore: expected object for sorenessMap')
  }
  const out: Partial<Record<MuscleGroup, number>> = {}
  for (const [k, v] of Object.entries(value)) {
    if (!MUSCLE_GROUPS.has(k as MuscleGroup)) continue
    const rating = readIntInRange(v, `sorenessMap.${k}`, 0, 5)
    out[k as MuscleGroup] = rating
  }
  return out
}

export function toFirestoreSession(session: Session): object {
  return serializeForFirestore(session) as object
}

export function fromFirestoreSession(
  doc: FirebaseFirestore.DocumentData,
): Session {
  return {
    id: readString(doc.id, 'id'),
    userId: readString(doc.userId, 'userId'),
    date: readIsoLike(doc.date, 'date'),
    exercises: readStringArray(doc.exercises, 'exercises'),
    durationMinutes: readNumber(doc.durationMinutes, 'durationMinutes'),
    warmupScore: readNumber(doc.warmupScore, 'warmupScore'),
    warmupDurationMinutes: readNumber(
      doc.warmupDurationMinutes,
      'warmupDurationMinutes',
    ),
    avgRiskScore: readNumber(doc.avgRiskScore, 'avgRiskScore'),
    peakRiskScore: readNumber(doc.peakRiskScore, 'peakRiskScore'),
    repCounts: readRecordStringNumber(doc.repCounts, 'repCounts'),
    exerciseRiskScores: (doc.exerciseRiskScores != null && typeof doc.exerciseRiskScores === 'object' && !Array.isArray(doc.exerciseRiskScores))
      ? readRecordStringNumber(doc.exerciseRiskScores, 'exerciseRiskScores')
      : undefined,
    formSuggestions: readStringArray(doc.formSuggestions, 'formSuggestions'),
    cooldownCompleted: readBoolean(doc.cooldownCompleted, 'cooldownCompleted'),
    cooldownExercises: readCooldownExercises(doc.cooldownExercises),
    feelRating: readFeelRating(doc.feelRating),
    totalRiskEvents: readNumber(doc.totalRiskEvents, 'totalRiskEvents'),
    workoutScore: (typeof doc.workoutScore === 'number' && Number.isFinite(doc.workoutScore))
      ? doc.workoutScore
      : undefined,
    exerciseWeights: (doc.exerciseWeights != null && typeof doc.exerciseWeights === 'object' && !Array.isArray(doc.exerciseWeights))
      ? readRecordStringNumber(doc.exerciseWeights, 'exerciseWeights')
      : undefined,
  }
}

export function toFirestoreLog(log: DailyLog): object {
  return serializeForFirestore(log) as object
}

export function fromFirestoreLog(doc: FirebaseFirestore.DocumentData): DailyLog {
  return {
    id: readString(doc.id, 'id'),
    userId: readString(doc.userId, 'userId'),
    date: readYyyyMmDd(doc.date, 'date'),
    sleepHours: readNumber(doc.sleepHours, 'sleepHours'),
    sleepQuality: readIntInRange(doc.sleepQuality, 'sleepQuality', 1, 5) as DailyLog['sleepQuality'],
    energyLevel: readIntInRange(doc.energyLevel, 'energyLevel', 1, 5) as DailyLog['energyLevel'],
    mood: readIntInRange(doc.mood, 'mood', 1, 5) as DailyLog['mood'],
    overallSoreness: readIntInRange(
      doc.overallSoreness,
      'overallSoreness',
      1,
      5,
    ) as DailyLog['overallSoreness'],
    sorenessMap: readSorenessMap(doc.sorenessMap),
    rpe: readIntInRange(doc.rpe, 'rpe', 0, 10),
    trainingType: readString(doc.trainingType, 'trainingType'),
    notes: typeof doc.notes === 'string' ? doc.notes : '',
  }
}
