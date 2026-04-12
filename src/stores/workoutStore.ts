import { create } from 'zustand'
import type { CooldownExercise, FormAnalysisResult, WorkoutPhase } from '../types/index'

// Re-export so existing imports from this module keep working
export type { WorkoutPhase }

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

  cooldownExercises: CooldownExercise[]

  // ── Actions ───────────────────────────────────────────────────────────
  setPhase:             (phase: WorkoutPhase) => void
  setExercise:          (exercise: string) => void
  addRep:               (exercise: string) => void
  updateAnalysis:       (result: FormAnalysisResult) => void
  setWarmupScore:       (score: number) => void
  setCooldownExercises: (exercises: CooldownExercise[]) => void
  resetSession:         () => void
}

// ── Initial state ──────────────────────────────────────────────────────────

const INITIAL: Omit<WorkoutState, 'setPhase' | 'setExercise' | 'addRep' | 'updateAnalysis' | 'setWarmupScore' | 'setCooldownExercises' | 'resetSession'> = {
  phase:             'warmup' as WorkoutPhase,
  currentExercise:   'squat',
  repCounts:         {},
  riskScores:        [],
  suggestions:       [],
  safetyConcerns:    [],
  warmupScore:       null,
  sessionStartTime:  null,
  cooldownExercises: [],
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useWorkoutStore = create<WorkoutState>()((set) => ({
  ...INITIAL,

  setPhase: (phase) => set({ phase }),

  setExercise: (exercise) => set({ currentExercise: exercise }),

  addRep: (exercise) => set((state) => ({
    repCounts: {
      ...state.repCounts,
      [exercise]: (state.repCounts[exercise] ?? 0) + 1,
    },
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

  resetSession: () => set({
    ...INITIAL,
    sessionStartTime: Date.now(),
  }),
}))
