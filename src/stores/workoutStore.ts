import { create } from 'zustand'
import type { FormAnalysisResult } from '../types/index'

// ── Types ──────────────────────────────────────────────────────────────────

export type WorkoutPhase = 'warmup' | 'main'

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
  /** Set when the user ends the main workout (before navigating to session summary). */
  sessionEndedAt:   number | null

  // ── Actions ───────────────────────────────────────────────────────────
  setPhase:       (phase: WorkoutPhase) => void
  setExercise:    (exercise: string) => void
  addRep:         (exercise: string) => void
  updateAnalysis: (result: FormAnalysisResult) => void
  setWarmupScore: (score: number) => void
  endSession:     () => void
  resetSession:   () => void
}

// ── Initial state ──────────────────────────────────────────────────────────

const INITIAL: Omit<WorkoutState, 'setPhase' | 'setExercise' | 'addRep' | 'updateAnalysis' | 'setWarmupScore' | 'endSession' | 'resetSession'> = {
  phase:            'warmup',
  currentExercise:  'squat',
  repCounts:        {},
  riskScores:       [],
  suggestions:      [],
  safetyConcerns:   [],
  warmupScore:      null,
  sessionStartTime: null,
  sessionEndedAt:   null,
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
    // Prepend new suggestions so latest is first; cap for in-session UI
    suggestions: [
      ...result.suggestions.map((text) => ({
        text,
        timestamp: Date.now(),
      })),
      ...state.suggestions,
    ].slice(0, 40),
    safetyConcerns: result.safetyConcerns,
  })),

  setWarmupScore: (score) => set({ warmupScore: score }),

  endSession: () => set({ sessionEndedAt: Date.now() }),

  resetSession: () => set({
    ...INITIAL,
    sessionStartTime: Date.now(),
  }),
}))
