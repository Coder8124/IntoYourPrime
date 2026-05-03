export interface WeeklyChallenge {
  id: string
  title: string
  description: string
  metric: 'sessions' | 'reps' | 'score' | 'risk' | 'cooldowns'
  target: number
  unit: string
  icon: string
}

export const CHALLENGES: WeeklyChallenge[] = [
  { id: 'w_score3',    title: 'High Scorer',      description: 'Score 70+ on 3 workouts this week',      metric: 'score',     target: 3,   unit: 'sessions ≥70', icon: '🎯' },
  { id: 'w_reps200',   title: 'Rep Machine',       description: 'Complete 200 total reps this week',       metric: 'reps',      target: 200, unit: 'reps',         icon: '💪' },
  { id: 'w_sessions4', title: 'Consistency King',  description: 'Work out 4 times this week',              metric: 'sessions',  target: 4,   unit: 'sessions',     icon: '📅' },
  { id: 'w_cooldown3', title: 'Cool Streak',        description: 'Complete cooldown in 3 sessions',        metric: 'cooldowns', target: 3,   unit: 'cooldowns',    icon: '🧊' },
  { id: 'w_score80_2', title: 'Elite Form',         description: 'Score 80+ on 2 workouts this week',      metric: 'score',     target: 2,   unit: 'sessions ≥80', icon: '✨' },
  { id: 'w_risk_3',    title: 'Safety First',       description: 'Keep avg risk below 40 for 3 sessions',  metric: 'risk',      target: 3,   unit: 'clean sessions', icon: '🛡️' },
  { id: 'w_reps300',   title: 'Volume Week',        description: 'Complete 300 total reps this week',       metric: 'reps',      target: 300, unit: 'reps',         icon: '🏋️' },
  { id: 'w_sessions5', title: '5-Day Push',         description: 'Work out 5 times this week',              metric: 'sessions',  target: 5,   unit: 'sessions',     icon: '🔥' },
]

export function getWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export function getCurrentChallenge(): WeeklyChallenge {
  const week = getWeekKey()
  const [, wPart] = week.split('-W')
  const idx = (parseInt(wPart, 10) - 1) % CHALLENGES.length
  return CHALLENGES[idx]
}

export interface ChallengeProgress {
  week: string
  challengeId: string
  value: number
  completed: boolean
}

export function computeChallengeProgress(
  challenge: WeeklyChallenge,
  sessions: Array<{
    date: string
    workoutScore?: number
    repCounts: Record<string, number>
    avgRiskScore: number
    cooldownCompleted: boolean
  }>,
): number {
  // ISO week: sessions this week have dates in the current week
  const weekStart = getWeekStartDate()
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)

  const thisWeek = sessions.filter(s => {
    const d = new Date(s.date)
    return d >= weekStart && d < weekEnd
  })

  switch (challenge.metric) {
    case 'sessions':
      return thisWeek.length
    case 'reps':
      return thisWeek.reduce((sum, s) => sum + Object.values(s.repCounts).reduce((a, b) => a + b, 0), 0)
    case 'score':
      return thisWeek.filter(s => (s.workoutScore ?? 0) >= (challenge.id === 'w_score80_2' ? 80 : 70)).length
    case 'risk':
      return thisWeek.filter(s => s.avgRiskScore < 40).length
    case 'cooldowns':
      return thisWeek.filter(s => s.cooldownCompleted).length
    default:
      return 0
  }
}

function getWeekStartDate(date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export { getWeekStartDate }
