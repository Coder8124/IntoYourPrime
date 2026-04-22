export interface ExerciseInfo {
  id: string
  name: string
  muscles: string[]
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  description: string
  cues: string[]
  riskNote: string
  isHold?: boolean
}

export const EXERCISE_INFO: ExerciseInfo[] = [
  {
    id: 'squat',
    name: 'Squat',
    muscles: ['Quads', 'Glutes', 'Hamstrings', 'Core'],
    difficulty: 'Beginner',
    description: 'The foundational lower-body movement. Builds strength through the full leg chain and improves hip mobility.',
    cues: [
      'Feet shoulder-width apart, toes slightly out',
      'Keep chest tall throughout the movement',
      'Drive knees out — track over your middle toe',
      'Descend until thighs are parallel to the floor',
      'Drive through your whole foot on the way up',
    ],
    riskNote: 'Main risk: knee valgus (knees caving inward). The AI tracks this in real time.',
  },
  {
    id: 'pushup',
    name: 'Push-Up',
    muscles: ['Chest', 'Triceps', 'Shoulders', 'Core'],
    difficulty: 'Beginner',
    description: 'A compound upper-body push movement. Trains chest, shoulders, and triceps while demanding core stability.',
    cues: [
      'Hands slightly wider than shoulder-width',
      'Body forms a straight line from head to heel',
      'Lower until chest almost touches the floor',
      'Elbows at ~45° from your torso — not flared wide',
      'Squeeze glutes and core throughout',
    ],
    riskNote: 'Main risks: hip sag (weak core) and elbow flare (shoulder strain). Both are tracked live.',
  },
  {
    id: 'lunge',
    name: 'Lunge',
    muscles: ['Quads', 'Glutes', 'Hamstrings', 'Calves'],
    difficulty: 'Beginner',
    description: 'A unilateral leg exercise that builds balance, coordination, and single-leg strength.',
    cues: [
      'Step forward long enough that your shin stays vertical',
      'Keep your torso upright — don\'t lean forward',
      'Front knee tracks over your second toe',
      'Lower your back knee toward (not onto) the floor',
      'Push through your front heel to return',
    ],
    riskNote: 'Main risk: front knee driving past the toes. The AI monitors knee tracking in real time.',
  },
  {
    id: 'deadlift',
    name: 'Deadlift',
    muscles: ['Hamstrings', 'Glutes', 'Lower Back', 'Traps', 'Core'],
    difficulty: 'Intermediate',
    description: 'The ultimate posterior-chain exercise. Builds total-body strength but demands proper spinal position.',
    cues: [
      'Hip-width stance, bar over mid-foot',
      'Hinge at the hips — push them back first',
      'Keep the bar close to your body throughout',
      'Neutral spine: no rounding at the lower back',
      'Drive your feet into the floor and lock out at the top',
    ],
    riskNote: 'Highest injury risk of all exercises: spinal rounding. AI scoring is more aggressive for deadlifts.',
  },
  {
    id: 'shoulderpress',
    name: 'Shoulder Press',
    muscles: ['Shoulders', 'Triceps', 'Upper Traps'],
    difficulty: 'Intermediate',
    description: 'An overhead pressing movement that builds shoulder strength and stability.',
    cues: [
      'Start with hands at shoulder height, elbows slightly in front',
      'Press directly overhead until arms are fully extended',
      'Keep your wrists stacked over your elbows',
      'Don\'t arch your lower back — brace your core',
      'Lower with control — don\'t drop the weight',
    ],
    riskNote: 'Main risks: lower back arch and wrist/shoulder asymmetry. Both tracked by pose landmarks.',
  },
  {
    id: 'curlup',
    name: 'Curl-Up',
    muscles: ['Abs', 'Hip Flexors'],
    difficulty: 'Beginner',
    description: 'A spinal-flexion core exercise that targets the rectus abdominis with low lumbar stress.',
    cues: [
      'Lie flat, knees bent, feet on the floor',
      'Place hands behind your head without pulling your neck',
      'Curl your shoulder blades off the floor — don\'t sit up fully',
      'Exhale on the way up, inhale on the way down',
      'Keep your lower back pressed into the floor',
    ],
    riskNote: 'Main risk: neck strain from pulling the head forward. The AI watches shoulder symmetry.',
  },
  {
    id: 'bicepcurl',
    name: 'Bicep Curl',
    muscles: ['Biceps', 'Brachialis', 'Forearms'],
    difficulty: 'Beginner',
    description: 'An isolation exercise for the elbow flexors. Simple but often cheated with body momentum.',
    cues: [
      'Stand tall — no swinging your torso',
      'Keep elbows pinned to your sides throughout',
      'Curl until your forearms are vertical',
      'Lower slowly — 2-3 second descent',
      'Squeeze at the top of each rep',
    ],
    riskNote: 'Main risks: elbow drift and body sway. The AI catches momentum cheating via shoulder position.',
  },
  {
    id: 'jumpingjack',
    name: 'Jumping Jack',
    muscles: ['Full Body', 'Cardio'],
    difficulty: 'Beginner',
    description: 'A full-body cardio movement that elevates heart rate and warms up the whole body.',
    cues: [
      'Start feet together, arms at your sides',
      'Jump feet wide while raising arms overhead',
      'Return to start in one fluid motion',
      'Land softly — bend your knees slightly',
      'Keep a steady rhythm — aim for 60-80 per minute',
    ],
    riskNote: 'Low injury risk. The AI watches arm symmetry to ensure full range of motion.',
  },
  {
    id: 'highnees',
    name: 'High Knees',
    muscles: ['Hip Flexors', 'Quads', 'Core', 'Cardio'],
    difficulty: 'Beginner',
    description: 'A high-intensity cardio drill that drives knee lift and builds hip flexor power.',
    cues: [
      'Run in place, driving knees up to hip height',
      'Stay on the balls of your feet',
      'Pump your arms to maintain rhythm',
      'Keep your torso upright — don\'t lean back',
      'Aim for speed: 80-100 contacts per minute',
    ],
    riskNote: 'The AI monitors torso sway, which indicates fatigue or loss of form at high speeds.',
  },
  {
    id: 'plank',
    name: 'Plank',
    muscles: ['Core', 'Shoulders', 'Glutes'],
    difficulty: 'Beginner',
    isHold: true,
    description: 'An isometric core hold that builds anti-extension strength and full-body stability.',
    cues: [
      'Forearms flat, elbows under shoulders',
      'Body forms a rigid straight line head to heel',
      'Squeeze glutes and quads hard',
      'Don\'t let your hips sag or pike up',
      'Breathe steadily — don\'t hold your breath',
    ],
    riskNote: 'Main risk: hip sag (core weakness). Same alignment check as push-up.',
  },
  {
    id: 'wallsit',
    name: 'Wall Sit',
    muscles: ['Quads', 'Glutes', 'Calves'],
    difficulty: 'Beginner',
    isHold: true,
    description: 'An isometric lower-body hold that builds quad endurance and knee stability.',
    cues: [
      'Back flat against the wall',
      'Thighs parallel to the floor (90° knee angle)',
      'Feet shoulder-width, flat on the floor',
      'Keep knees tracking over your toes',
      'Arms at your sides or on your thighs — not pushing off',
    ],
    riskNote: 'Main risk: knee valgus under fatigue. Same tracking as squats.',
  },
  {
    id: 'tricepextension',
    name: 'Tricep Extension',
    muscles: ['Triceps', 'Shoulders'],
    difficulty: 'Intermediate',
    description: 'An overhead isolation exercise that fully stretches and contracts the triceps through a long range of motion.',
    cues: [
      'Stand tall, core braced, feet shoulder-width',
      'Raise both arms overhead, elbows pointing forward',
      'Lower the weight behind your head by bending at the elbows only',
      'Keep elbows close together — don\'t let them flare wide',
      'Press back to full extension, squeezing the triceps at the top',
    ],
    riskNote: 'Main risks: elbow flare and upper arm drift. The AI tracks elbow position relative to your shoulders.',
  },
]

export interface WorkoutProgram {
  id: string
  name: string
  description: string
  level: 'Beginner' | 'Intermediate' | 'Advanced'
  duration: string
  exercises: string[]
  tags: string[]
  emoji: string
}

export const WORKOUT_PROGRAMS: WorkoutProgram[] = [
  {
    id: 'beginner-full-body',
    name: 'Beginner Full Body',
    description: 'A complete intro routine hitting every major muscle group. Perfect for your first week.',
    level: 'Beginner',
    duration: '~20 min',
    exercises: ['squat', 'pushup', 'lunge', 'curlup'],
    tags: ['Full Body', 'No Equipment', 'Strength'],
    emoji: '🌱',
  },
  {
    id: 'upper-body-burn',
    name: 'Upper Body Burn',
    description: 'Chest, shoulders, arms. Three pushing exercises back to back for an upper-body pump.',
    level: 'Intermediate',
    duration: '~20 min',
    exercises: ['pushup', 'shoulderpress', 'bicepcurl', 'tricepextension'],
    tags: ['Upper Body', 'Push', 'Strength'],
    emoji: '💪',
  },
  {
    id: 'lower-body-power',
    name: 'Lower Body Power',
    description: 'Quads, glutes, hamstrings. Heavy compound movements for leg strength and power.',
    level: 'Intermediate',
    duration: '~25 min',
    exercises: ['squat', 'deadlift', 'lunge'],
    tags: ['Lower Body', 'Strength', 'Power'],
    emoji: '🦵',
  },
  {
    id: 'hiit-circuit',
    name: 'HIIT Circuit',
    description: 'Alternating cardio and strength bursts. Max heart rate, minimum rest.',
    level: 'Intermediate',
    duration: '~15 min',
    exercises: ['jumpingjack', 'squat', 'highnees', 'pushup'],
    tags: ['Cardio', 'HIIT', 'Full Body'],
    emoji: '⚡',
  },
  {
    id: 'core-stability',
    name: 'Core & Stability',
    description: 'Isometric holds and controlled movements that build deep core strength and posture.',
    level: 'Beginner',
    duration: '~15 min',
    exercises: ['plank', 'wallsit', 'curlup'],
    tags: ['Core', 'Stability', 'Isometric'],
    emoji: '🎯',
  },
  {
    id: 'strength-builder',
    name: 'Strength Builder',
    description: 'Five compound movements covering push, pull, and legs. The full-body strength standard.',
    level: 'Advanced',
    duration: '~35 min',
    exercises: ['deadlift', 'squat', 'pushup', 'shoulderpress', 'lunge'],
    tags: ['Full Body', 'Compound', 'Strength'],
    emoji: '🏋️',
  },
]

export interface ActiveProgram {
  id: string
  name: string
  exercises: string[]
  currentIndex: number
}

export const PROGRAM_KEY = 'formAI_activeProgram'

export function getActiveProgram(): ActiveProgram | null {
  try {
    const raw = localStorage.getItem(PROGRAM_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ActiveProgram
  } catch {
    return null
  }
}

export function setActiveProgram(program: WorkoutProgram): void {
  const active: ActiveProgram = {
    id: program.id,
    name: program.name,
    exercises: program.exercises,
    currentIndex: 0,
  }
  localStorage.setItem(PROGRAM_KEY, JSON.stringify(active))
}

export function advanceProgramExercise(): ActiveProgram | null {
  const current = getActiveProgram()
  if (!current) return null
  const next = { ...current, currentIndex: current.currentIndex + 1 }
  if (next.currentIndex >= next.exercises.length) {
    localStorage.removeItem(PROGRAM_KEY)
    return null
  }
  localStorage.setItem(PROGRAM_KEY, JSON.stringify(next))
  return next
}

export function clearActiveProgram(): void {
  localStorage.removeItem(PROGRAM_KEY)
}
