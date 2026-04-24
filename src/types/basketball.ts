import type { PoseFrame } from './pose'

export type Handedness = 'right' | 'left'

/**
 * How the shooter arrived at the load point. Affects BEEF leniency.
 * - 'stationary': set feet, catch-and-shoot, or stand-still form shooting.
 * - 'movement':   off the dribble / pull-up; hips translated into the load.
 */
export type ShotContext = 'stationary' | 'movement'

export interface ShotWindow {
  frames: PoseFrame[]        // load → release → follow-through tail
  preLoadFrames: PoseFrame[] // ~500ms before loadIndex
  loadIndex: number          // index within `frames`
  releaseIndex: number       // index within `frames`
  handedness: Handedness
  context: ShotContext
}

export interface BeefScore {
  balance: number        // 0–100
  eyes: number           // 0–100 (head-stability proxy)
  elbow: number          // 0–100
  followThrough: number  // 0–100
  overall: number        // 0–100, mean of the above
  notes: string[]        // human-readable cues, ordered by severity
}

export interface Shot {
  id: string
  timestamp: number
  handedness: Handedness
  context: ShotContext
  beef: BeefScore
}
