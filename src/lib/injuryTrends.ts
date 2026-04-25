import type { Session } from '../types/index'

// ── Body part → exercises mapping ─────────────────────────────────────────

const BODY_PART_EXERCISES: Record<string, string[]> = {
  knees: [
    'squat', 'lunge', 'jumpsquat', 'wallsit', 'sidelunge', 'bulgariansplitsquat',
    'stepup', 'reverseLunge', 'curtsylunge', 'legpress', 'legsextension', 'mountainclimber',
    'boxjump', 'skaterjump', 'tuckjump', 'burpee',
  ],
  lower_back: [
    'deadlift', 'romaniandeadlift', 'goodmorning', 'hipthrust', 'superman', 'hyperextension',
    'deadbug', 'birddog', 'burpee', 'mountainclimber', 'legpress',
  ],
  shoulders: [
    'pushup', 'shoulderpress', 'benchpress', 'lateralraise', 'frontraise', 'reverseFly',
    'arnoldpress', 'pikeupshup', 'diamondpushup', 'declinepushup', 'inclinepushup',
    'chestfly', 'chestpress', 'pullup', 'invertedrow', 'plank', 'crossbodystretch',
    'scapulasqueeze', 'armcircle', 'shoulderroll', 'widegripushup',
  ],
  elbows: [
    'pushup', 'bicepcurl', 'hammercurl', 'tricepextension', 'benchpress', 'pullup',
    'diamondpushup', 'skullcrusher', 'concentrationcurl', 'zottmancurl', 'chinup',
  ],
  hips: [
    'squat', 'lunge', 'deadlift', 'hipcircle', 'sidelunge', 'bulgariansplitsquat',
    'hipthrust', 'glutebridge', 'donkeykick', 'firehydrant', 'reverseLunge', 'curtsylunge',
    'sumoSquat', 'pigeonstretsh',
  ],
  wrists: [
    'pushup', 'plank', 'benchpress', 'chestfly', 'bicepcurl', 'tricepextension',
    'wristcurl', 'diamondpushup',
  ],
  neck: [
    'curlup', 'situp', 'crunch', 'bicycleCrunch', 'russiantwist', 'neckroll',
  ],
  hamstrings: [
    'deadlift', 'romaniandeadlift', 'lunge', 'bulgariansplitsquat', 'legcurl',
    'goodmorning', 'hipthrust', 'glutebridge', 'reverseLunge', 'hamstringstretch',
    'nordicCurl',
  ],
  core: [
    'plank', 'sideplank', 'situp', 'curlup', 'mountainclimber', 'deadbug', 'birddog',
    'hollowbody', 'vSit', 'legRaise', 'flutterKick', 'russiantwist', 'bicycleCrunch',
    'burpee', 'abWheel',
  ],
}

// Reverse map: exercise → body parts affected
const EXERCISE_BODY_PARTS: Record<string, string[]> = {}
for (const [bodyPart, exercises] of Object.entries(BODY_PART_EXERCISES)) {
  for (const ex of exercises) {
    if (!EXERCISE_BODY_PARTS[ex]) EXERCISE_BODY_PARTS[ex] = []
    EXERCISE_BODY_PARTS[ex].push(bodyPart)
  }
}

// ── Linear regression ─────────────────────────────────────────────────────

function linearRegression(values: number[]): { slope: number; r2: number } {
  const n = values.length
  if (n < 2) return { slope: 0, r2: 0 }

  const xBar = (n - 1) / 2
  const yBar = values.reduce((a, b) => a + b, 0) / n

  let ssXX = 0
  let ssXY = 0
  let ssTot = 0

  for (let i = 0; i < n; i++) {
    ssXX += (i - xBar) ** 2
    ssXY += (i - xBar) * (values[i] - yBar)
    ssTot += (values[i] - yBar) ** 2
  }

  if (ssXX === 0) return { slope: 0, r2: 0 }
  const slope = ssXY / ssXX
  const ssRes = ssTot - slope * ssXY
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0

  return { slope, r2 }
}

// ── Recommendations database ──────────────────────────────────────────────

const RECOMMENDATIONS: Record<string, {
  cause: string
  explanation: string
  fixes: string[]
}> = {
  knees: {
    cause: 'Knee valgus (inward collapse) during loaded movements',
    explanation: 'Your knee tracking has been deteriorating across recent sessions. This usually means hip abductors and glute medius are fatiguing, or a mobility restriction is causing your knees to cave inward under load — the most common ACL/meniscus injury pattern.',
    fixes: [
      'Add clamshell exercises and lateral band walks to strengthen glute medius before leg days',
      'Reduce load/depth temporarily — quality reps over quantity',
      'Film your squats/lunges from the front: watch knee-to-toe alignment',
      'Foam roll your IT band and hip flexors before knee-intensive sessions',
      'Consider a knee sleeve for proprioceptive feedback during heavy sets',
    ],
  },
  lower_back: {
    cause: 'Spinal flexion under load (rounding) or hyperextension compensation',
    explanation: 'Your lower back risk scores are trending upward. This typically indicates either losing neutral spine under fatigue (rounding in deadlifts/squats) or compensating with lumbar hyperextension (arching excessively during overhead or pulling movements). Both patterns accumulate cumulative stress on intervertebral discs.',
    fixes: [
      'Brace your core harder before each rep — exhale into your core like you\'re about to take a punch',
      'Lower working weights by 15-20% and re-groove movement patterns with perfect form',
      'Add anti-extension core work: dead bugs, bird dogs, ab wheel',
      'Check hip flexor tightness — tight hip flexors tilt the pelvis and increase lumbar load',
      'Consider a 1-2 day lower-back rest while maintaining upper body training',
    ],
  },
  shoulders: {
    cause: 'Shoulder impingement or rotator cuff overload from poor scapular mechanics',
    explanation: 'Shoulder risk is climbing. The most common culprit is internal rotation during pressing or pulling movements — elbows flaring too wide, wrists drifting behind elbows, or failing to retract shoulder blades before loading. Over time this pinches soft tissue in the subacromial space.',
    fixes: [
      'Pre-activate: 2 sets of band pull-aparts and face-pulls before every upper session',
      'For presses: elbows at 45-75° from your torso — not flared 90° wide',
      'Pinch your shoulder blades back and DOWN before any overhead work',
      'Add rear delt and external rotation work: reverse flies, external rotation drills',
      'Avoid going overhead if you have sharp pain — work horizontal pressing only until resolved',
    ],
  },
  elbows: {
    cause: 'Medial epicondyle stress (golfer\'s elbow) from elbow drift or momentum curling',
    explanation: 'Elbow risk scores are rising, which commonly points to lateral or medial epicondyle stress. This happens when elbows drift forward during curls (takes load off bicep, onto tendon), or when pressing with a grip that\'s too wide or too narrow.',
    fixes: [
      'Keep elbows pinned to sides during all curl variations — zero drift',
      'Lower the weight 20% and focus on a slow 3-second eccentric phase',
      'Avoid hammering the joint to full lockout on tricep extensions — stop 10° short',
      'Add wrist flexor and extensor stretches to your cooldown',
      'Rest 48h between elbow-intensive sessions — tendons recover slower than muscle',
    ],
  },
  hips: {
    cause: 'Hip flexor tightness or reduced hip mobility reducing movement quality',
    explanation: 'Hip risk is increasing. Tight hip flexors (common in people who sit for long periods) force the lower back to compensate in squatting and hinging movements. Reduced hip external rotation leads to knee and lower back compensation chains.',
    fixes: [
      'Spend 5 minutes on hip circles and 90/90 hip stretch before every session',
      'Add pigeon pose, couch stretch (hip flexor), and world\'s greatest stretch to your cooldown',
      'Widen stance slightly for squats to allow more hip external rotation',
      'Bulgarian split squats often reveal asymmetric hip mobility — address the tighter side',
      'Consider yoga or dedicated mobility sessions 2x/week',
    ],
  },
  wrists: {
    cause: 'Wrist extension overload from plank/push-up/pressing positions',
    explanation: 'Wrist scores are trending up. Repetitive wrist extension under load (plank, push-up, pressing) stresses the extensor tendons and can develop into tendinitis. This is particularly common during volume-heavy weeks.',
    fixes: [
      'Add wrist flexor and extensor stretches: 30s each direction before and after sessions',
      'For push-ups: use push-up handles or make fists on the floor to reduce wrist extension',
      'Reduce plank volume temporarily — quality over duration',
      'Apply compression wrap on heavy push days',
      'Rest wrists for 48h if you feel sharp pain on loaded extension',
    ],
  },
  neck: {
    cause: 'Cervical spine strain from forward head position during floor core work',
    explanation: 'Neck risk is increasing. During sit-ups and curl-ups, people reflexively pull their head forward with their hands — this jams the cervical facet joints and strains the neck extensors. Over many sessions, this accumulates.',
    fixes: [
      'Never use your hands to pull your head forward — place them on your temples or cross on chest',
      'Keep your chin tucked slightly toward your chest during all crunch movements',
      'Focus on driving movement from the rib cage, not the head',
      'Switch to dead bug or ab wheel variations that remove neck stress entirely',
      'Stretch: chin tucks (10 reps) and neck side stretch (30s/side) in cooldown',
    ],
  },
  hamstrings: {
    cause: 'Hamstring strain risk from insufficient warm-up or rapid fatigue under load',
    explanation: 'Hamstring risk scores are rising. The hamstrings are the most commonly strained muscle in the body, especially when cold or fatigued. Rapid eccentric load (deadlifts going down, sprint deceleration) with inadequate preparation is the main mechanism.',
    fixes: [
      'Never skip the warmup — leg swings and inchworms before deadlifts are non-negotiable',
      'Add Nordic curls (assisted) to build eccentric hamstring strength',
      'After deadlifts, always do a hip hinge stretch or standing toe touch to decompress the muscle',
      'Increase deadlift tempo: 3 second lowering phase to control eccentric load',
      'Consider hamstring massage or foam rolling 24h after heavy sessions',
    ],
  },
  core: {
    cause: 'Core fatigue leading to reduced stability transfer in compound movements',
    explanation: 'Core risk is trending upward. When the core fatigues, it stops acting as a rigid force transfer between upper and lower body — this causes compensations in squats, presses, and carries that increase injury risk system-wide.',
    fixes: [
      'Train core at the START of sessions when fresh, not just in cooldown',
      'Focus on anti-rotation and anti-extension patterns: Pallof press, dead bug, plank variations',
      'Reduce rep counts on ballistic core work (sit-ups) and replace with quality isometric holds',
      'Brace and breathe properly: inhale and brace before each lift, exhale through effort',
      'Sleep 7-9 hours — core stability degrades rapidly with fatigue',
    ],
  },
}

// ── Types ─────────────────────────────────────────────────────────────────

export type TrendSeverity = 'improving' | 'stable' | 'worsening' | 'critical'

export interface BodyPartTrend {
  bodyPart: string
  displayName: string
  severity: TrendSeverity
  slope: number
  r2: number
  recentAvg: number
  sessionCount: number
  scores: number[]
  cause: string
  explanation: string
  fixes: string[]
}

// ── Display names ─────────────────────────────────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  knees: 'Knees',
  lower_back: 'Lower Back',
  shoulders: 'Shoulders',
  elbows: 'Elbows',
  hips: 'Hips',
  wrists: 'Wrists',
  neck: 'Neck',
  hamstrings: 'Hamstrings',
  core: 'Core',
}

// ── Main analysis function ────────────────────────────────────────────────

export function analyzeInjuryTrends(sessions: Session[]): BodyPartTrend[] {
  // Need at least 3 sessions for meaningful trend
  if (sessions.length < 3) return []

  // Sort oldest → newest
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  // Build per-body-part risk score series from exerciseRiskScores
  const bodyPartScores: Record<string, Array<{ score: number; sessionIdx: number }>> = {}

  sorted.forEach((session, sessionIdx) => {
    if (!session.exerciseRiskScores) return

    const bodyPartHits: Record<string, number[]> = {}

    for (const [exercise, riskScore] of Object.entries(session.exerciseRiskScores)) {
      const affectedParts = EXERCISE_BODY_PARTS[exercise] ?? []
      for (const part of affectedParts) {
        if (!bodyPartHits[part]) bodyPartHits[part] = []
        bodyPartHits[part].push(riskScore)
      }
    }

    for (const [part, scores] of Object.entries(bodyPartHits)) {
      if (!bodyPartScores[part]) bodyPartScores[part] = []
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      bodyPartScores[part].push({ score: avg, sessionIdx })
    }
  })

  const trends: BodyPartTrend[] = []

  for (const [bodyPart, entries] of Object.entries(bodyPartScores)) {
    if (entries.length < 3) continue

    const scores = entries.map(e => e.score)
    const { slope, r2 } = linearRegression(scores)
    const recentAvg = scores.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, scores.length)

    let severity: TrendSeverity
    // Slope per session: positive = worsening (higher risk), negative = improving
    // r2 threshold: only flag if trend is at least somewhat consistent
    if (slope <= -1.5 && r2 > 0.3) {
      severity = 'improving'
    } else if (slope >= 5 && recentAvg >= 65 && r2 > 0.3) {
      severity = 'critical'
    } else if (slope >= 2 && r2 > 0.25) {
      severity = 'worsening'
    } else {
      severity = 'stable'
    }

    // Only include in results if there's a notable trend (not stable)
    if (severity === 'stable') continue

    const rec = RECOMMENDATIONS[bodyPart]
    if (!rec) continue

    trends.push({
      bodyPart,
      displayName: DISPLAY_NAMES[bodyPart] ?? bodyPart,
      severity,
      slope: Math.round(slope * 10) / 10,
      r2: Math.round(r2 * 100) / 100,
      recentAvg: Math.round(recentAvg),
      sessionCount: entries.length,
      scores: scores.map(s => Math.round(s)),
      ...rec,
    })
  }

  // Sort: critical first, then worsening, then improving
  const order: Record<TrendSeverity, number> = {
    critical: 0,
    worsening: 1,
    improving: 2,
    stable: 3,
  }
  return trends.sort((a, b) => order[a.severity] - order[b.severity])
}

export function trendSeverityLabel(severity: TrendSeverity): string {
  switch (severity) {
    case 'critical':  return '🚨 Critical'
    case 'worsening': return '⚠️ Worsening'
    case 'improving': return '✅ Improving'
    case 'stable':    return '→ Stable'
  }
}

export function trendSeverityColor(severity: TrendSeverity): string {
  switch (severity) {
    case 'critical':  return '#ef4444'
    case 'worsening': return '#f59e0b'
    case 'improving': return '#22c55e'
    case 'stable':    return '#6b7280'
  }
}
