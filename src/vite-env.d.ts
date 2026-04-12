/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// ── MediaPipe Pose globals (loaded via CDN in index.html) ──────────────────

interface NormalizedLandmark {
  x: number
  y: number
  z: number
  visibility?: number
}

interface PoseResults {
  poseLandmarks: NormalizedLandmark[]
  poseWorldLandmarks: NormalizedLandmark[]
}

interface PoseOptions {
  modelComplexity?: 0 | 1 | 2
  smoothLandmarks?: boolean
  enableSegmentation?: boolean
  smoothSegmentation?: boolean
  minDetectionConfidence?: number
  minTrackingConfidence?: number
}

interface PoseInstance {
  setOptions: (options: PoseOptions) => void
  onResults: (callback: (results: PoseResults) => void) => void
  send: (input: { image: HTMLVideoElement }) => Promise<void>
  close: () => void
}

interface DrawStyle {
  color: string
  lineWidth: number
  fillColor?: string
  radius?: number
  visibilityMin?: number
}

declare interface Window {
  Pose: new (config: { locateFile: (file: string) => string }) => PoseInstance
  drawConnectors: (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    connections: [number, number][],
    style: DrawStyle
  ) => void
  drawLandmarks: (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    style: DrawStyle
  ) => void
  POSE_CONNECTIONS: [number, number][]
}
