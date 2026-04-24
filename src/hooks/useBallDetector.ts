import { useEffect, useRef, useState, useCallback } from 'react'

export interface BallPos {
  x: number  // 0-1 normalized center x
  y: number  // 0-1 normalized center y
  r: number  // normalized radius (0-1 of min dimension)
  ts: number // timestamp ms
}

// Score the arc quality from a trajectory of ball positions.
// Returns 0-100 or null if not enough data.
export function scoreArcFromTrajectory(trajectory: BallPos[]): number | null {
  const recent = trajectory.filter(p => Date.now() - p.ts < 2500)
  if (recent.length < 6) return null

  const ys = recent.map(p => p.y)
  const minY = Math.min(...ys)
  const minIdx = ys.indexOf(minY)

  // Peak must be in the middle third of the trajectory
  const peakRatio = minIdx / ys.length
  if (peakRatio < 0.15 || peakRatio > 0.85) return null

  // Arc height relative to endpoints (higher = better arc)
  const startY = (ys[0] + (ys[1] ?? ys[0])) / 2
  const endY   = (ys[ys.length - 1] + (ys[ys.length - 2] ?? ys[ys.length - 1])) / 2
  const baseY  = Math.max(startY, endY)
  const arcH   = baseY - minY  // positive = ball went up (lower y = higher in frame)

  if (arcH < 0.02) return 15  // dead-flat shot

  // 0.04 frame height arc → ~40pts, 0.15+ → 100pts
  const arcScore = Math.round(Math.min(100, 15 + arcH * 600))
  return arcScore
}

// Estimate make/miss from ball positions captured after shot release.
// Heuristic: a make = ball rises, then disappears in the upper 45% of frame.
// A miss = ball rises then comes back down to lower half.
export function estimateMake(trajectory: BallPos[]): 'make' | 'miss' | 'unknown' {
  if (trajectory.length < 4) return 'unknown'

  const ys = trajectory.map(p => p.y)
  const lastPos = trajectory[trajectory.length - 1]
  const now = Date.now()

  // Need arc: ball must have gone up meaningfully
  const minY = Math.min(...ys)
  const arcHeight = ys[0] - minY  // positive = ball went higher in frame
  if (arcHeight < 0.05) return 'unknown'

  // Ball disappeared (not detected for ≥400ms after its last position)
  const ballGone = now - lastPos.ts > 400

  // Last known position is in top 45% of frame (near where hoop would be)
  if (ballGone && lastPos.y < 0.45) return 'make'

  // Ball came back down into lower half after going up = miss
  const tailY = ys.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, ys.length)
  if (tailY > 0.55 && minY < 0.40) return 'miss'

  return 'unknown'
}

export function useBallDetector(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const modelRef = useRef<{ detect: (img: HTMLVideoElement) => Promise<Array<{ class: string; score: number; bbox: [number, number, number, number] }>> } | null>(null)
  const [modelReady, setModelReady] = useState(false)
  const [modelLoading, setModelLoading] = useState(false)
  const [ballPos, setBallPos] = useState<BallPos | null>(null)
  const trajectoryRef = useRef<BallPos[]>([])
  const rafRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    setModelLoading(true)
    ;(async () => {
      try {
        // Dynamic imports so TF.js doesn't bloat initial bundle
        const tf = await import('@tensorflow/tfjs')
        try { await tf.setBackend('webgl') } catch { await tf.setBackend('cpu') }
        await tf.ready()
        const cocoSsd = await import('@tensorflow-models/coco-ssd')
        const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
        if (!cancelled) {
          modelRef.current = model as typeof modelRef.current
          setModelReady(true)
          setModelLoading(false)
        }
      } catch {
        if (!cancelled) setModelLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const detect = useCallback(() => {
    const video = videoRef.current
    const model = modelRef.current
    if (!video || !model || video.readyState < 2 || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(detect)
      return
    }

    frameCountRef.current++
    // Run detection every 3rd frame (~10fps) to keep CPU load low
    if (frameCountRef.current % 3 !== 0) {
      rafRef.current = requestAnimationFrame(detect)
      return
    }

    model.detect(video).then(preds => {
      const ball = preds
        .filter(p => p.class === 'sports ball' && p.score > 0.25)
        .sort((a, b) => b.score - a.score)[0]

      if (ball) {
        const [bx, by, bw, bh] = ball.bbox
        const pos: BallPos = {
          x: (bx + bw / 2) / video.videoWidth,
          y: (by + bh / 2) / video.videoHeight,
          r: Math.max(bw, bh) / 2 / Math.min(video.videoWidth, video.videoHeight),
          ts: Date.now(),
        }
        setBallPos(pos)
        trajectoryRef.current = [...trajectoryRef.current.slice(-120), pos]
      } else {
        const last = trajectoryRef.current[trajectoryRef.current.length - 1]
        if (!last || Date.now() - last.ts > 600) setBallPos(null)
      }

      rafRef.current = requestAnimationFrame(detect)
    }).catch(() => {
      rafRef.current = requestAnimationFrame(detect)
    })
  }, [videoRef])

  useEffect(() => {
    if (modelReady) {
      rafRef.current = requestAnimationFrame(detect)
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [modelReady, detect])

  const getTrajectory = useCallback(() => [...trajectoryRef.current], [])
  const clearTrajectory = useCallback(() => { trajectoryRef.current = [] }, [])

  return { ballPos, modelReady, modelLoading, getTrajectory, clearTrajectory }
}
