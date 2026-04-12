import { create } from 'zustand'
import type { CooldownExercise, FormAnalysisResult } from '../types/index'

// ── Types ──────────────────────────────────────────────────────────────────

export type WorkoutPhase = 'warmup' | 'main' | 'cooldown'

export interface SuggestionEntry {
  text:      string
  timestamp: number
}

interface WorkoutState {
  // ── Data ──────────────────────────────────────────────────────────────
  phase:            WorkoutPhase
  currentExercise:  string
  repCounts:        Record<string, number>
  riskScores:       number[]
  suggestions:      SuggestionEntry[]
  safetyConcerns:   string[]
  warmupScore:      number | null
  sessionStartTime: number | null
  /** Timestamp when warmup phase ended (user clicked "Start Workout"). */
  warmupEndedAt:    number | null
  /** Set when the user ends the main workout. */
  sessionEndedAt:   number | null
  cooldownExercises:  CooldownExercise[]
  cooldownCompleted:  boolean

  // ── Actions ───────────────────────────────────────────────────────────
  setPhase:             (phase: WorkoutPhase) => void
  setExercise:          (exercise: string) => void
  addRep:               (exercise: string) => void
  resetExerciseReps:    (exercise: string) => void
  updateAnalysis:       (result: FormAnalysisResult) => void
  setWarmupScore:       (score: number) => void
  setCooldownExercises: (exercises: CooldownExercise[]) => void
  setCooldownCompleted: (completed: boolean) => void
  endSession:           () => void
  resetSession:         () => void
}

// ── Initial state ──────────────────────────────────────────────────────────

const INITIAL: Omit<WorkoutState,
  | 'setPhase' | 'setExercise' | 'addRep' | 'resetExerciseReps' | 'updateAnalysis'
  | 'setWarmupScore' | 'setCooldownExercises' | 'setCooldownCompleted' | 'endSession' | 'resetSession'
> = {
  phase:             'warmup',
  currentExercise:   'squat',
  repCounts:         {},
  riskScores:        [],
  suggestions:       [],
  safetyConcerns:    [],
  warmupScore:       null,
  sessionStartTime:  null,
  warmupEndedAt:     null,
  sessionEndedAt:    null,
  cooldownExercises: [],
  cooldownCompleted: false,
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useWorkoutStore = create<WorkoutState>()((set) => ({
  ...INITIAL,

  setPhase: (phase) => set((state) => ({
    phase,
    warmupEndedAt: phase === 'main' && state.phase === 'warmup' ? Date.now() : state.warmupEndedAt,
  })),

  setExercise: (exercise) => set({ currentExercise: exercise }),

  addRep: (exercise) => set((state) => ({
    repCounts: {
      ...state.repCounts,
      [exercise]: (state.repCounts[exercise] ?? 0) + 1,
    },
  })),

  resetExerciseReps: (exercise) => set((state) => ({
    repCounts: { ...state.repCounts, [exercise]: 0 },
  })),

  updateAnalysis: (result) => set((state) => {
    const hasNewSuggestions = result.suggestions.length > 0
    return {
      riskScores: [...state.riskScores.slice(-50), result.riskScore],
      // Only update suggestions when new ones arrive (not on every risk update)
      suggestions: hasNewSuggestions
        ? [
            ...result.suggestions.map((text) => ({ text, timestamp: Date.now() })),
            ...state.suggestions,
          ].slice(0, 10)
        : state.suggestions,
      safetyConcerns: result.safetyConcerns.length > 0
        ? result.safetyConcerns
        : state.safetyConcerns,
    }
  }),

  setWarmupScore: (score) => set({ warmupScore: score }),

  setCooldownExercises: (exercises) => set({ cooldownExercises: exercises }),

  setCooldownCompleted: (completed) => set({ cooldownCompleted: completed }),

  endSession: () => set({ sessionEndedAt: Date.now() }),

  resetSession: () => set({
    ...INITIAL,
    sessionStartTime: Date.now(),
  }),
}))
