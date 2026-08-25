/**
 * rep.ts — the structured representation of a single repetition.
 *
 * The rep counter used to emit a bare integer. Everything downstream (coaching,
 * summaries, the LLM) had to guess at what the movement actually looked like.
 * A `Rep` is the unit those consumers should read instead: what the signal did
 * between two rep boundaries, how confident we are about it, and nothing that
 * requires a network call to produce.
 *
 * All fields are derived from the normalised movement signal the counter already
 * computes (0 = top / lockout, 1 = bottom / loaded position), so they are
 * comparable across exercises without knowing which landmarks drove the signal.
 */

/** One frame of the normalised movement signal. */
export interface SignalSample {
  t:     number   // ms epoch
  norm:  number   // 0 (top) … 1 (bottom)
  conf:  number   // 0–1 mean landmark visibility for the driving joints
  left:  number   // raw left-side joint coordinate (for symmetry), NaN if unavailable
  right: number   // raw right-side joint coordinate
}

export interface Rep {
  repId:      number
  exercise:   string
  startTime:  number
  endTime:    number
  durationMs: number

  /** Time the signal spent travelling toward the loaded position. */
  eccentricMs:  number
  /** Time travelling back toward lockout. */
  concentricMs: number
  /** Time held at/near the bottom (norm above the bottom threshold). */
  bottomMs:     number

  /** Peak-to-peak excursion over the rep, as a % of the calibrated range. */
  romPct:     number
  /** Seconds per rep. */
  tempo:      number
  /** Peak normalised units per second during the concentric. */
  velocity:   number

  /** 0–100. How evenly the left and right joints moved. Null when the signal is not bilateral. */
  symmetry:   number | null
  /** 0–100. Smoothness of the signal path — low values mean a jerky, uncontrolled rep. */
  stability:  number
  /** 0–100 mean landmark visibility across the rep. */
  landmarkConfidence: number
  /** 0–100. How much to trust that this was a real, fully-observed rep. */
  confidence: number
  /** ROM fell well short of this set's typical rep. */
  partial:    boolean
}

/** Set-level rollup — the trends that individual reps cannot show. */
export interface SetMetrics {
  reps:            number
  avgRomPct:       number
  avgTempo:        number
  avgVelocity:     number
  avgStability:    number
  avgSymmetry:     number | null
  avgConfidence:   number
  partialReps:     number
  /** % change from the first third of the set to the last third. Negative = declining. */
  romTrendPct:      number
  velocityTrendPct: number
  /** 0–100 consistency of rep duration. Low = ragged pacing. */
  consistency:     number
  /** 0–100. How much the set degraded — combines ROM and velocity decline. 0 = fresh. */
  fatigue:         number
}

// ── Rep construction ───────────────────────────────────────────────────────

/** Reps shorter than this are almost certainly signal noise rather than movement. */
const MIN_PLAUSIBLE_MS = 350
/** A rep whose ROM is below this fraction of the set's typical ROM is a partial. */
const PARTIAL_ROM_RATIO = 0.65
/** How far back to search for the turning point that started the rep. */
const LOOKBACK_MS = 600
/** Movement below this in normalised units is noise around a stationary signal. */
const FLAT_EPS = 0.004

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)))
}

/**
 * Narrow a sample buffer down to the movement that actually produced the rep.
 *
 * The buffer runs from the previous rep boundary, so it also contains however
 * long the user stood still beforehand. Walking back from the end to the far
 * extreme and then to the start of that excursion gives the real rep window —
 * without it, a rep taken after a 10 s rest reports a 10 s tempo.
 */
function trimToRep(
  samples:         SignalSample[],
  bottomThreshold: number,
  topThreshold:    number,
  endPhase:        'up' | 'down',
): SignalSample[] {
  const atFarExtreme = endPhase === 'up'
    ? (n: number) => n >= bottomThreshold
    : (n: number) => n <= topThreshold
  const atNearExtreme = endPhase === 'up'
    ? (n: number) => n <= topThreshold
    : (n: number) => n >= bottomThreshold

  let far = -1
  for (let i = samples.length - 1; i >= 0; i--) {
    if (atFarExtreme(samples[i].norm)) { far = i; break }
  }
  if (far <= 0) return samples

  let crossing = 0
  for (let i = far - 1; i >= 0; i--) {
    if (atNearExtreme(samples[i].norm)) { crossing = i; break }
  }

  // The threshold crossing is partway into the movement — the rep really began
  // at the turning point just before it. Walk back only while the signal keeps
  // moving toward the near extreme; a flat stretch means the user was idle, and
  // idle time is not part of the rep.
  let start = crossing
  for (let i = crossing - 1; i >= 0 && samples[crossing].t - samples[i].t <= LOOKBACK_MS; i--) {
    const gain = endPhase === 'up'
      ? samples[start].norm - samples[i].norm
      : samples[i].norm - samples[start].norm
    if (gain > FLAT_EPS) start = i
  }
  return samples.slice(start)
}

/**
 * Turn the samples collected between two rep boundaries into a Rep.
 *
 * `bottomThreshold` / `topThreshold` are the counter's own phase thresholds,
 * passed in so the phase durations line up with the phase it actually reported.
 * `priorRoms` are the ROMs of earlier reps in the set — used only to decide
 * whether this rep was a partial.
 */
export function buildRep(params: {
  repId:           number
  exercise:        string
  samples:         SignalSample[]
  bottomThreshold: number
  topThreshold:    number
  endPhase:        'up' | 'down'
  priorRoms:       number[]
  bilateral:       boolean
}): Rep | null {
  const { repId, exercise, bottomThreshold, topThreshold, endPhase, priorRoms, bilateral } = params
  const samples = trimToRep(params.samples, bottomThreshold, topThreshold, endPhase)
  if (samples.length < 3) return null

  const startTime  = samples[0].t
  const endTime    = samples[samples.length - 1].t
  const durationMs = endTime - startTime
  if (durationMs <= 0) return null

  let minNorm = Infinity, maxNorm = -Infinity
  let eccentricMs = 0, concentricMs = 0, bottomMs = 0
  let peakConcentric = 0
  let jerk = 0

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    if (s.norm < minNorm) minNorm = s.norm
    if (s.norm > maxNorm) maxNorm = s.norm
    if (i === 0) continue

    const prev = samples[i - 1]
    const dt   = s.t - prev.t
    if (dt <= 0) continue
    const dn = s.norm - prev.norm

    if (s.norm >= bottomThreshold) bottomMs += dt
    if (dn > 0) eccentricMs += dt
    else if (dn < 0) {
      concentricMs += dt
      peakConcentric = Math.max(peakConcentric, -dn / (dt / 1000))
    }

    // Second difference of the signal — a controlled rep traces a smooth arc.
    if (i >= 2) {
      const prev2 = samples[i - 2]
      jerk += Math.abs((s.norm - prev.norm) - (prev.norm - prev2.norm))
    }
  }

  const romPct = clamp100((maxNorm - minNorm) * 100)

  // Symmetry: compare how far each side travelled over the rep.
  let symmetry: number | null = null
  if (bilateral) {
    const lefts  = samples.map(s => s.left).filter(Number.isFinite)
    const rights = samples.map(s => s.right).filter(Number.isFinite)
    if (lefts.length >= 3 && rights.length >= 3) {
      const lRange = Math.max(...lefts)  - Math.min(...lefts)
      const rRange = Math.max(...rights) - Math.min(...rights)
      const larger = Math.max(lRange, rRange)
      symmetry = larger > 1e-4
        ? clamp100((1 - Math.abs(lRange - rRange) / larger) * 100)
        : 100
    }
  }

  // Jerk accumulates per frame, so normalise by frame count before scoring.
  const meanJerk  = jerk / Math.max(1, samples.length - 2)
  const stability = clamp100(100 - meanJerk * 1200)

  const landmarkConfidence = clamp100(mean(samples.map(s => s.conf)) * 100)

  const typicalRom = priorRoms.length >= 2 ? median(priorRoms) : romPct
  const partial    = typicalRom > 0 && romPct < typicalRom * PARTIAL_ROM_RATIO

  // Confidence: how well-observed the rep was, how complete its range, and
  // whether it lasted long enough to be a movement rather than a twitch.
  const romCompleteness = typicalRom > 0 ? Math.min(1, romPct / typicalRom) : 1
  const plausibility    = durationMs < MIN_PLAUSIBLE_MS ? durationMs / MIN_PLAUSIBLE_MS : 1
  const confidence      = clamp100(
    landmarkConfidence * 0.5 + romCompleteness * 100 * 0.3 + plausibility * 100 * 0.2,
  )

  return {
    repId,
    exercise,
    startTime,
    endTime,
    durationMs,
    eccentricMs:  Math.round(eccentricMs),
    concentricMs: Math.round(concentricMs),
    bottomMs:     Math.round(bottomMs),
    romPct,
    tempo:        Math.round(durationMs / 100) / 10,
    velocity:     Math.round(peakConcentric * 100) / 100,
    symmetry,
    stability,
    landmarkConfidence,
    confidence,
    partial,
  }
}

// ── Set rollup ─────────────────────────────────────────────────────────────

/** % change between the mean of the first third and the last third of a series. */
function trendPct(values: number[]): number {
  if (values.length < 4) return 0
  const n     = Math.max(1, Math.floor(values.length / 3))
  const first = mean(values.slice(0, n))
  const last  = mean(values.slice(-n))
  if (first === 0) return 0
  return Math.round(((last - first) / first) * 100)
}

export function summarizeSet(reps: Rep[]): SetMetrics | null {
  if (!reps.length) return null

  const roms       = reps.map(r => r.romPct)
  const tempos     = reps.map(r => r.tempo)
  const velocities = reps.map(r => r.velocity)
  const symmetries = reps.map(r => r.symmetry).filter((v): v is number => v !== null)

  const romTrendPct      = trendPct(roms)
  const velocityTrendPct = trendPct(velocities)

  // Consistency: coefficient of variation of rep duration, inverted.
  const meanTempo = mean(tempos)
  const variance  = mean(tempos.map(t => (t - meanTempo) ** 2))
  const cv        = meanTempo > 0 ? Math.sqrt(variance) / meanTempo : 0
  const consistency = clamp100((1 - cv) * 100)

  // Fatigue only counts decline, not improvement.
  const fatigue = clamp100(
    Math.max(0, -romTrendPct) * 1.5 + Math.max(0, -velocityTrendPct) * 1.0,
  )

  return {
    reps:          reps.length,
    avgRomPct:     Math.round(mean(roms)),
    avgTempo:      Math.round(meanTempo * 10) / 10,
    avgVelocity:   Math.round(mean(velocities) * 100) / 100,
    avgStability:  Math.round(mean(reps.map(r => r.stability))),
    avgSymmetry:   symmetries.length ? Math.round(mean(symmetries)) : null,
    avgConfidence: Math.round(mean(reps.map(r => r.confidence))),
    partialReps:   reps.filter(r => r.partial).length,
    romTrendPct,
    velocityTrendPct,
    consistency,
    fatigue,
  }
}
