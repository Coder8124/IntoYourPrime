export function computeWorkoutScore(params: {
  avgRisk: number
  totalReps: number
  cooldownCompleted: boolean
  warmupScore: number
  durationMinutes: number
}): number {
  const { avgRisk, totalReps, cooldownCompleted, warmupScore, durationMinutes } = params
  const formScore    = (1 - Math.min(avgRisk, 100) / 100) * 40
  const repScore     = Math.min(totalReps / 30, 1) * 20
  const cooldown     = cooldownCompleted ? 15 : 0
  const warmup       = (Math.min(warmupScore, 100) / 100) * 15
  const duration     = Math.min(durationMinutes / 30, 1) * 10
  return Math.round(formScore + repScore + cooldown + warmup + duration)
}

export function scoreGrade(score: number): { grade: string; color: string; label: string } {
  if (score >= 95) return { grade: 'S', color: '#a78bfa', label: 'Perfect'    }
  if (score >= 85) return { grade: 'A', color: '#22c55e', label: 'Excellent'  }
  if (score >= 70) return { grade: 'B', color: '#3b82f6', label: 'Great'      }
  if (score >= 55) return { grade: 'C', color: '#f59e0b', label: 'Good'       }
  if (score >= 40) return { grade: 'D', color: '#f97316', label: 'Fair'       }
  return              { grade: 'F', color: '#ef4444', label: 'Needs Work'  }
}
