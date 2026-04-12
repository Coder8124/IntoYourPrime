import { useRef, useState, useCallback, useEffect } from 'react'
import type { RefObject } from 'react'
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose'
import type { NormalizedLandmark, Results } from '@mediapipe/pose'

// ── Constants ──────────────────────────────────────────────────────────────

const BUFFER_SIZE    = 120   // 4 s at 30 fps
const FRAME_W        = 640
const FRAME_H        = 480
const JPEG_QUALITY   = 0.7
const TRACKING_THRESH = 0.5

// ── Internal frame entry ───────────────────────────────────────────────────

interface FrameEntry {
  dataUrl:    string
  confidence: number
}

// ── Return type ────────────────────────────────────────────────────────────

export interface UsePoseDetectionReturn {
  landmarks:    NormalizedLandmark[] | null
  isTracking:   boolean
  confidence:   number
  getBestFrames: (n: number) => string[]
  startCamera:  () => Promise<void>
  stopCamera:   () => void
  isLoading:    boolean
  error:        string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function avgVisibility(lms: NormalizedLandmark[]): number {
  if (!lms.length) return 0
  return lms.reduce((sum, lm) => sum + (lm.visibility ?? 0), 0) / lms.length
}

function connectionColor(conf: number): string {
  if (conf > 0.7)  return '#22c55e'   // green
  if (conf >= 0.4) return '#f59e0b'   // amber
  return '#ef4444'                     // red
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function usePoseDetection(
  videoRef:  RefObject<HTMLVideoElement>,
  canvasRef: RefObject<HTMLCanvasElement>,
): UsePoseDetectionReturn {

  // ── Refs (never trigger re-render) ──────────────────────────────────────
  const poseRef         = useRef<Pose | null>(null)
  const streamRef       = useRef<MediaStream | null>(null)
  const rafRef          = useRef<number>(0)
  const processingRef   = useRef(false)
  const frameBuffer     = useRef<FrameEntry[]>([])
  const offscreenRef    = useRef<HTMLCanvasElement | null>(null)
  // stable mutable mirror of state for use inside RAF callbacks
  const runningRef      = useRef(false)

  // ── State ────────────────────────────────────────────────────────────────
  const [landmarks,  setLandmarks]  = useState<NormalizedLandmark[] | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [confidence, setConfidence] = useState(0)
  const [isLoading,  setIsLoading]  = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // ── Offscreen canvas (frame capture) ────────────────────────────────────
  const getOffscreen = useCallback((): HTMLCanvasElement => {
    if (!offscreenRef.current) {
      const c = document.createElement('canvas')
      c.width  = FRAME_W
      c.height = FRAME_H
      offscreenRef.current = c
    }
    return offscreenRef.current
  }, [])

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return null
    const canvas = getOffscreen()
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H)
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  }, [videoRef, getOffscreen])

  // ── Circular buffer ──────────────────────────────────────────────────────
  const storeFrame = useCallback((dataUrl: string, conf: number) => {
    frameBuffer.current.push({ dataUrl, confidence: conf })
    if (frameBuffer.current.length > BUFFER_SIZE) {
      frameBuffer.current.shift()
    }
  }, [])

  // ── Skeleton drawing ─────────────────────────────────────────────────────
  const drawSkeleton = useCallback((
    ctx:    CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    lms:    NormalizedLandmark[],
  ) => {
    ctx.save()

    // Mirror transform — feels like looking in a mirror
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)

    const px = (x: number) => x * canvas.width
    const py = (y: number) => y * canvas.height

    // Draw connections
    for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
      const a = lms[startIdx]
      const b = lms[endIdx]
      if (!a || !b) continue

      const connConf = ((a.visibility ?? 0) + (b.visibility ?? 0)) / 2

      ctx.beginPath()
      ctx.moveTo(px(a.x), py(a.y))
      ctx.lineTo(px(b.x), py(b.y))
      ctx.strokeStyle = connectionColor(connConf)
      ctx.lineWidth   = 2.5
      ctx.lineCap     = 'round'
      ctx.stroke()
    }

    // Draw landmark dots
    for (const lm of lms) {
      const lmConf = lm.visibility ?? 0
      ctx.beginPath()
      ctx.arc(px(lm.x), py(lm.y), 4, 0, Math.PI * 2)
      ctx.fillStyle   = connectionColor(lmConf)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth   = 1
      ctx.stroke()
    }

    ctx.restore()
  }, [])

  // ── MediaPipe results handler ────────────────────────────────────────────
  const onResults = useCallback((results: Results) => {
    processingRef.current = false

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!results.poseLandmarks) {
      setLandmarks(null)
      setIsTracking(false)
      setConfidence(0)
      return
    }

    const lms  = results.poseLandmarks
    const conf = avgVisibility(lms)

    setLandmarks(lms)
    setConfidence(conf)
    setIsTracking(conf > TRACKING_THRESH)

    drawSkeleton(ctx, canvas, lms)

    // Capture & buffer frame
    const dataUrl = captureFrame()
    if (dataUrl) storeFrame(dataUrl, conf)
  }, [canvasRef, drawSkeleton, captureFrame, storeFrame])

  // ── Public: getBestFrames ────────────────────────────────────────────────
  const getBestFrames = useCallback((n: number): string[] => {
    return [...frameBuffer.current]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, n)
      .map(f => f.dataUrl)
  }, [])

  // ── Public: stopCamera ───────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    runningRef.current = false
    cancelAnimationFrame(rafRef.current)
    processingRef.current = false

    poseRef.current?.close()
    poseRef.current = null

    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    setLandmarks(null)
    setIsTracking(false)
    setConfidence(0)
  }, [])

  // ── Public: startCamera ──────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    // Stop any existing session before re-starting
    stopCamera()

    setIsLoading(true)
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) throw new Error('Video element is not mounted')

      video.srcObject = stream
      await video.play()

      // Init MediaPipe Pose
      const pose = new Pose({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      })

      pose.setOptions({
        modelComplexity:       1,
        smoothLandmarks:       true,
        enableSegmentation:    false,
        minDetectionConfidence: 0.6,
        minTrackingConfidence:  0.5,
      })

      pose.onResults(onResults)

      // Warm up the model (first send is slow; do it before revealing UI)
      if (video.readyState >= 2) {
        await pose.send({ image: video }).catch(() => {/* ignore first-frame errors */})
      }

      poseRef.current   = pose
      runningRef.current = true
      setIsLoading(false)

      // ── RAF detection loop ─────────────────────────────────────────────
      const loop = async () => {
        if (!runningRef.current) return

        const vid = videoRef.current
        if (vid && poseRef.current && !processingRef.current && vid.readyState >= 2) {
          processingRef.current = true
          await poseRef.current.send({ image: vid }).catch(() => {
            processingRef.current = false
          })
        }

        rafRef.current = requestAnimationFrame(loop)
      }

      rafRef.current = requestAnimationFrame(loop)

    } catch (err) {
      setIsLoading(false)
      const msg = err instanceof Error
        ? err.message
        : 'Camera access denied. Please allow camera permissions and reload.'
      setError(msg)
    }
  }, [videoRef, onResults, stopCamera])

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => () => {
    stopCamera()
  }, [stopCamera])

  return {
    landmarks,
    isTracking,
    confidence,
    getBestFrames,
    startCamera,
    stopCamera,
    isLoading,
    error,
  }
}
