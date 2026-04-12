import { create } from 'zustand'
import type { FormAnalysisResult, WorkoutPhase } from '../types/index'

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

  // ── Actions ───────────────────────────────────────────────────────────
  setPhase:       (phase: WorkoutPhase) => void
  setExercise:    (exercise: string) => void
  addRep:         (exercise: string) => void
  updateAnalysis: (result: FormAnalysisResult) => void
  setWarmupScore: (score: number) => void
  resetSession:   () => void
}

// ── Initial state ──────────────────────────────────────────────────────────

const INITIAL: Omit<WorkoutState, 'setPhase' | 'setExercise' | 'addRep' | 'updateAnalysis' | 'setWarmupScore' | 'resetSession'> = {
  phase:            'warmup' as WorkoutPhase,
  currentExercise:  'squat',
  repCounts:        {},
  riskScores:       [],
  suggestions:      [],
  safetyConcerns:   [],
  warmupScore:      null,
  sessionStartTime: null,
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

  updateAnalysis: (result) => set((state) => ({
    riskScores:    [...state.riskScores, result.riskScore],
    // Prepend new suggestions so latest is first; cap at 10 total
    suggestions: [
      ...result.suggestions.map((text) => ({
        text,
        timestamp: Date.now(),
      })),
      ...state.suggestions,
    ].slice(0, 10),
    safetyConcerns: result.safetyConcerns,
  })),

  setWarmupScore: (score) => set({ warmupScore: score }),

  resetSession: () => set({
    ...INITIAL,
    sessionStartTime: Date.now(),
  }),
}))
