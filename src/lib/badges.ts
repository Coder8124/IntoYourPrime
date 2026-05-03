export interface BadgeDef {
  id: string
  name: string
  description: string
  icon: string
  color: string
}

export const ALL_BADGES: BadgeDef[] = [
  { id: 'first_workout',   name: 'First Step',      description: 'Complete your first workout',            icon: '🚀', color: '#3b82f6' },
  { id: 'perfect_form',    name: 'Perfect Form',     description: 'Score 90+ in a single session',          icon: '✨', color: '#a78bfa' },
  { id: 'century',         name: 'Century Club',     description: '100+ reps in a single session',          icon: '💯', color: '#f59e0b' },
  { id: 'iron_week',       name: 'Iron Week',        description: '7-day workout streak',                   icon: '🔥', color: '#ef4444' },
  { id: 'iron_month',      name: 'Iron Month',       description: '30-day workout streak',                  icon: '⚡', color: '#f97316' },
  { id: 'cooldown_habit',  name: 'Cool Operator',    description: 'Complete cooldown in 3 sessions',        icon: '🧊', color: '#22d3ee' },
  { id: 'risk_master',     name: 'Risk Master',      description: 'Avg form risk below 20 in a session',    icon: '🎯', color: '#22c55e' },
  { id: 'marathon',        name: 'Marathon Session', description: 'Complete a 30+ minute workout',          icon: '⏱️', color: '#8b5cf6' },
  { id: 'socialite',       name: 'Squad Goals',      description: 'Add 3 friends to your squad',            icon: '🤝', color: '#ec4899' },
  { id: 'veteran',         name: 'Veteran',          description: 'Complete 10 workouts',                   icon: '🏅', color: '#f59e0b' },
  { id: 'challenger',      name: 'Challenger',       description: 'Complete a weekly challenge',            icon: '🏆', color: '#fbbf24' },
  { id: 'no_risk',         name: 'Ghost Mode',       description: 'Complete a full session with 0 risk events', icon: '👻', color: '#6ee7b7' },
]

export const BADGE_MAP = Object.fromEntries(ALL_BADGES.map(b => [b.id, b]))

export interface BadgeCheckContext {
  workoutScore: number
  totalReps: number
  avgRiskScore: number
  cooldownCompleted: boolean
  durationMinutes: number
  highRiskEvents: number
  totalSessions: number
  streakCount: number
  cooldownCompletedCount: number
  friendCount: number
  weeklyChallengeDone: boolean
}

export function checkNewBadges(ctx: BadgeCheckContext, existing: string[]): string[] {
  const earned = new Set(existing)
  const newBadges: string[] = []

  const check = (id: string, condition: boolean) => {
    if (condition && !earned.has(id)) {
      earned.add(id)
      newBadges.push(id)
    }
  }

  check('first_workout',  ctx.totalSessions >= 1)
  check('perfect_form',   ctx.workoutScore >= 90)
  check('century',        ctx.totalReps >= 100)
  check('iron_week',      ctx.streakCount >= 7)
  check('iron_month',     ctx.streakCount >= 30)
  check('cooldown_habit', ctx.cooldownCompletedCount >= 3)
  check('risk_master',    ctx.avgRiskScore < 20 && ctx.totalReps > 0)
  check('marathon',       ctx.durationMinutes >= 30)
  check('socialite',      ctx.friendCount >= 3)
  check('veteran',        ctx.totalSessions >= 10)
  check('challenger',     ctx.weeklyChallengeDone)
  check('no_risk',        ctx.highRiskEvents === 0 && ctx.totalReps > 0)

  return newBadges
}
