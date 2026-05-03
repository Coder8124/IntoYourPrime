import type { NormalizedLandmark } from '@mediapipe/pose'

/**
 * A single frame of pose landmarks + timestamp. Shared across producers
 * (live webcam today, video upload later) and consumers (shot detector).
 */
export interface PoseFrame {
  landmarks: NormalizedLandmark[]
  timestamp: number  // ms, monotonic (performance.now())
}
