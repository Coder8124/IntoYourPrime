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
    id: 'mountainclimber',
    name: 'Mountain Climbers',
    muscles: ['Core', 'Hip Flexors', 'Shoulders', 'Quads'],
    difficulty: 'Intermediate',
    description: 'A dynamic plank variation that combines core stability with cardio. Alternating knee drives build endurance and hip flexor strength.',
    cues: [
      'Start in a high plank — shoulders directly over wrists',
      'Keep hips level — no piking up or sagging down',
      'Drive one knee toward your chest, then quickly switch',
      'Keep your core braced throughout — belly button to spine',
      'Land lightly on the ball of each foot',
    ],
    riskNote: 'Main risk: hip piking or sagging as you fatigue. The AI monitors your hip position against the shoulder–ankle line.',
  },
  {
    id: 'benchpress',
    name: 'Bench Press',
    muscles: ['Chest', 'Triceps', 'Shoulders'],
    difficulty: 'Intermediate',
    description: 'The primary horizontal push movement. Builds chest mass and upper-body pressing strength.',
    cues: [
      'Retract and depress your shoulder blades — pack them into the bench',
      'Grip just outside shoulder-width, wrists stacked over elbows',
      'Lower the bar to your lower chest in a slight arc',
      'Elbows at ~45-75° from your torso — not flared wide',
      'Press back up and slightly toward your face at lockout',
    ],
    riskNote: 'Main risk: elbow flare past shoulder width — high shoulder impingement risk. AI tracks elbow path and wrist symmetry.',
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
  {
    id: 'lateralraise',
    name: 'Lateral Raise',
    muscles: ['Shoulders', 'Traps', 'Serratus'],
    difficulty: 'Beginner',
    description: 'An isolation exercise for the lateral deltoid that builds shoulder width. Commonly cheated with momentum.',
    cues: [
      'Stand tall, slight bend in the elbows — don\'t lock them straight',
      'Raise arms out to the sides until parallel with the floor',
      'Lead with your elbows, not your wrists',
      'Lower slowly — 2-3 second descent',
      'No shrugging — keep your traps relaxed',
    ],
    riskNote: 'Main risks: asymmetric arm height and forward wrist reach. The AI tracks wrist symmetry and position.',
  },
  {
    id: 'hammercurl',
    name: 'Hammer Curl',
    muscles: ['Biceps', 'Brachialis', 'Brachioradialis', 'Forearms'],
    difficulty: 'Beginner',
    description: 'A neutral-grip curl variation that hits the brachialis and brachioradialis harder than a standard curl.',
    cues: [
      'Palms facing each other (neutral grip) throughout the movement',
      'Keep elbows pinned to your sides — no swinging',
      'Curl until forearms are vertical',
      'Lower with control — 2 second descent',
      'Don\'t rotate your wrists — maintain neutral grip the entire rep',
    ],
    riskNote: 'Same risks as bicep curl: elbow drift and body sway. The AI catches momentum cheating.',
  },
  {
    id: 'pullup',
    name: 'Pull-Up',
    muscles: ['Lats', 'Biceps', 'Rear Delts', 'Core'],
    difficulty: 'Advanced',
    description: 'The gold-standard back exercise. Requires pulling your bodyweight from a dead hang to chin-over-bar.',
    cues: [
      'Start from a full dead hang — arms completely extended',
      'Pull your shoulder blades down and together before initiating',
      'Drive elbows toward your hips as you pull',
      'Chin clears the bar — don\'t stop short',
      'Lower with control — avoid dropping into the dead hang',
    ],
    riskNote: 'Main risks: shoulder asymmetry and elbow flare. The AI tracks shoulder balance and elbow alignment.',
  },
  {
    id: 'buttskick',
    name: 'Butt Kicks',
    muscles: ['Hamstrings', 'Glutes', 'Calves', 'Cardio'],
    difficulty: 'Beginner',
    description: 'A high-cadence cardio drill that fires the hamstrings and warms up the posterior chain.',
    cues: [
      'Run in place, kicking your heels up toward your glutes',
      'Stay on the balls of your feet — light and quick',
      'Keep your torso upright — slight forward lean, not leaning back',
      'Pump your arms in opposition to your legs',
      'Aim for speed: 80-100 contacts per minute',
    ],
    riskNote: 'Low injury risk. AI monitors torso lean — leaning back stresses the lower back.',
  },
  {
    id: 'calfraise',
    name: 'Calf Raises',
    muscles: ['Gastrocnemius', 'Soleus', 'Calves'],
    difficulty: 'Beginner',
    description: 'An isolation exercise for the calves. Simple but often done with too little range of motion.',
    cues: [
      'Stand with feet hip-width, toes pointing forward',
      'Rise all the way onto the balls of your feet — full extension',
      'Hold the top for 1 second — squeeze the calves',
      'Lower with control — 2-3 second descent',
      'Keep weight evenly distributed across both feet',
    ],
    riskNote: 'Very low injury risk. AI watches for uneven loading and incomplete range of motion.',
  },
  {
    id: 'situp',
    name: 'Sit-Up',
    muscles: ['Abs', 'Hip Flexors', 'Core'],
    difficulty: 'Beginner',
    description: 'A full spinal-flexion core exercise that brings the torso to an upright position.',
    cues: [
      'Lie flat, knees bent, feet on the floor or anchored',
      'Cross arms on chest or place hands behind head without pulling',
      'Curl up until your torso is nearly vertical',
      'Exhale on the way up, inhale on the way down',
      'Lower with control — don\'t flop back down',
    ],
    riskNote: 'Main risk: neck strain from pulling the head forward. Keep hands light on the head.',
  },
  {
    id: 'armcircle',
    name: 'Arm Circles',
    muscles: ['Shoulders', 'Rotator Cuff', 'Upper Back'],
    difficulty: 'Beginner',
    description: 'A shoulder mobility warm-up or active recovery exercise. Lubricates the joint through full rotation.',
    cues: [
      'Stand tall, arms extended straight out to the sides',
      'Make full circles — as big as possible',
      'Keep your core tight — don\'t let your torso rotate',
      'Do both directions: forward and backward sets',
      'Breathe steadily — this should feel like a stretch, not a strain',
    ],
    riskNote: 'Very low injury risk. AI checks arm symmetry and full range of motion on both sides.',
  },
  {
    id: 'hipcircle',
    name: 'Hip Circles',
    muscles: ['Hip Flexors', 'Glutes', 'Lower Back', 'Core'],
    difficulty: 'Beginner',
    description: 'A dynamic mobility drill that lubricates the hip joint and loosens the lower back. Essential warm-up movement.',
    cues: [
      'Stand with feet shoulder-width, hands on hips',
      'Rotate your hips in the widest circle possible',
      'Keep your shoulders still — only your hips move',
      'Go slow: 3–4 seconds per circle',
      'Do equal reps in both directions',
    ],
    riskNote: 'Very low injury risk. AI watches for shoulder sway — only the hips should be driving the movement.',
  },
  {
    id: 'chestpress',
    name: 'Chest Press',
    muscles: ['Chest', 'Triceps', 'Shoulders'],
    difficulty: 'Beginner',
    description: 'A standing horizontal push movement. Mimics the bench press pattern but upright — great for activation with bands or light weights.',
    cues: [
      'Start with hands at chest height, elbows at shoulder level',
      'Press both arms forward until nearly straight',
      'Keep wrists neutral — do not bend them back',
      'Return with control — don\'t let the weight snap your elbows back',
      'Keep torso upright throughout — no rocking or swaying',
    ],
    riskNote: 'Low injury risk. AI monitors elbow height symmetry and torso stability.',
  },
  {
    id: 'crossbodystretch',
    name: 'Cross-Body Shoulder Stretch',
    muscles: ['Posterior Deltoid', 'Rotator Cuff', 'Upper Back'],
    difficulty: 'Beginner',
    isHold: true,
    description: 'A static stretch for the rear shoulder and upper back. Commonly used in warm-up and cooldown routines.',
    cues: [
      'Bring one arm straight across your chest at shoulder height',
      'Use the opposite hand to hold it at the elbow — not the wrist',
      'Keep your shoulder down — don\'t let it shrug up toward your ear',
      'Hold for 20–30 seconds, then switch sides',
      'Look straight ahead — don\'t rotate your torso toward the arm',
    ],
    riskNote: 'Very low injury risk. AI watches for shoulder hike and torso rotation.',
  },
  {
    id: 'tricepstretch',
    name: 'Tricep Stretch',
    muscles: ['Triceps', 'Shoulder', 'Lats'],
    difficulty: 'Beginner',
    isHold: true,
    description: 'An overhead stretch for the tricep and shoulder. Improves elbow extension mobility.',
    cues: [
      'Raise one arm overhead and bend the elbow, dropping your hand behind your head',
      'Use the other hand to gently press down on the bent elbow',
      'Keep the elbow pointing straight up — not forward or out to the side',
      'Stay upright — don\'t lean sideways to compensate',
      'Hold for 20–30 seconds, then switch arms',
    ],
    riskNote: 'Very low injury risk. AI checks elbow alignment and neck neutrality.',
  },
  {
    id: 'scapulasqueeze',
    name: 'Scapula Squeeze',
    muscles: ['Rhomboids', 'Middle Trapezius', 'Rear Deltoids'],
    difficulty: 'Beginner',
    description: 'An upper-back corrective exercise that retracts the shoulder blades. Counters forward posture from sitting and pressing work.',
    cues: [
      'Stand or sit tall — do not let your chest collapse',
      'Pull your shoulder blades toward each other as if pinching a pencil between them',
      'Keep your shoulders DOWN — do not shrug up toward your ears',
      'Hold the squeeze for 2–3 seconds, then release fully',
      'Arms can be at your sides, in a "T", or bent in a "W" — all are valid',
    ],
    riskNote: 'Very low injury risk. Main error is shrugging instead of retracting. AI tracks shoulder symmetry and height.',
  },
  {
    id: 'sidelunge',
    name: 'Side Lunge',
    muscles: ['Glutes', 'Quads', 'Adductors', 'Hamstrings'],
    difficulty: 'Beginner',
    description: 'A lateral lunge that trains the frontal plane — often neglected. Builds hip mobility, adductor strength, and single-leg stability.',
    cues: [
      'Step wide enough that your shin stays vertical — knee not past toes',
      'Push your hips back and sit into the bending leg',
      'Keep the extended leg straight, foot flat on the floor',
      'Torso upright — do not lean forward over your knee',
      'Drive through your heel to return to standing',
    ],
    riskNote: 'Main risk: knee valgus on the bending side. AI monitors lateral knee tracking in real time.',
  },
  {
    id: 'chestfly',
    name: 'Chest Fly',
    muscles: ['Chest', 'Anterior Deltoid', 'Biceps (stabilizer)'],
    difficulty: 'Intermediate',
    description: 'An isolation movement that stretches and contracts the pectorals through a wide arc. Best done with cables or light dumbbells.',
    cues: [
      'Slight bend in the elbows — maintain throughout the movement',
      'Open arms wide in a controlled arc until you feel a chest stretch',
      'Keep wrists neutral — do not let them bend back',
      'Squeeze the chest as arms return to center — do not slam them together',
      'Keep shoulder blades pinched back and down throughout',
    ],
    riskNote: 'Main risk: going too wide with straight elbows — tears the pec tendon. AI monitors arm symmetry and elbow position.',
  },
  {
    id: 'jumpsquat',
    name: 'Jump Squat',
    muscles: ['Quads', 'Glutes', 'Hamstrings', 'Calves', 'Core'],
    difficulty: 'Intermediate',
    description: 'An explosive lower-body movement that builds power and elevates heart rate. The squat pattern meets plyometric training.',
    cues: [
      'Squat to at least parallel before driving up',
      'Explode through your whole foot — drive the floor away',
      'Land softly — bend your knees and hips to absorb the impact',
      'Keep knees tracking over your toes on both the squat and the landing',
      'Maintain an upright chest throughout — do not collapse forward',
    ],
    riskNote: 'Main risk: knee valgus on landing — high ACL injury risk. The AI watches landing mechanics closely.',
  },
  {
    id: 'burpee',
    name: 'Burpee',
    muscles: ['Full Body', 'Cardio', 'Core', 'Chest', 'Quads', 'Shoulders'],
    difficulty: 'Intermediate',
    description: 'The ultimate full-body conditioning exercise. Three phases — squat, plank, and jump — in one continuous movement.',
    cues: [
      'Phase 1 — Stand: feet shoulder-width, ready to drop',
      'Phase 2 — Squat & plank: hands hit the floor, jump/step feet back to plank position — hips stay level',
      'Phase 3 — Return & jump: jump/step feet forward, drive through your legs, jump and clap overhead',
      'Keep your core braced in the plank — no hip sagging or piking',
      'Land softly each time — absorb impact through bent knees',
    ],
    riskNote: 'Key risks: hip sag in plank phase and knee valgus on landing. Both tracked in real time.',
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
  targetReps: number     // reps to complete before auto-advancing to next exercise
  targetHoldSecs: number // seconds for hold exercises (plank, wallsit, etc.)
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
    targetReps: 10,
    targetHoldSecs: 30,
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
    targetReps: 12,
    targetHoldSecs: 30,
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
    targetReps: 10,
    targetHoldSecs: 30,
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
    targetReps: 20,
    targetHoldSecs: 30,
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
    targetReps: 10,
    targetHoldSecs: 30,
  },
  {
    id: 'strength-builder',
    name: 'Strength Builder',
    description: 'Compound push, pull, and leg movements. The full-body strength standard.',
    level: 'Advanced',
    duration: '~35 min',
    exercises: ['deadlift', 'squat', 'pullup', 'pushup', 'shoulderpress', 'lunge'],
    tags: ['Full Body', 'Compound', 'Strength'],
    emoji: '🏋️',
    targetReps: 10,
    targetHoldSecs: 30,
  },
  {
    id: 'arms-shoulders',
    name: 'Arms & Shoulders',
    description: 'A complete arm and shoulder isolation routine covering all major push and pull muscles.',
    level: 'Intermediate',
    duration: '~25 min',
    exercises: ['bicepcurl', 'hammercurl', 'tricepextension', 'lateralraise', 'shoulderpress'],
    tags: ['Upper Body', 'Isolation', 'Arms'],
    emoji: '💪',
    targetReps: 12,
    targetHoldSecs: 30,
  },
]

export interface ActiveProgram {
  id: string
  name: string
  exercises: string[]
  currentIndex: number
  targetReps: number
  targetHoldSecs: number
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
    targetReps: program.targetReps,
    targetHoldSecs: program.targetHoldSecs,
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

// ── Custom programs (user-created / AI-generated) ──────────────────────────

const CUSTOM_PROGRAMS_KEY = 'formAI_custom_programs'

export function getCustomPrograms(): WorkoutProgram[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PROGRAMS_KEY)
    return raw ? (JSON.parse(raw) as WorkoutProgram[]) : []
  } catch { return [] }
}

export function saveCustomProgram(program: WorkoutProgram): void {
  const existing = getCustomPrograms().filter(p => p.id !== program.id)
  localStorage.setItem(CUSTOM_PROGRAMS_KEY, JSON.stringify([program, ...existing]))
}

export function deleteCustomProgram(id: string): void {
  const programs = getCustomPrograms().filter(p => p.id !== id)
  localStorage.setItem(CUSTOM_PROGRAMS_KEY, JSON.stringify(programs))
}
