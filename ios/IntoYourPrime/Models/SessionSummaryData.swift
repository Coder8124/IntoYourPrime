import Foundation

struct SessionSummaryData: Identifiable {
    var id = UUID()
    var session:    WorkoutSession
    var score:      Int
    var analysis:   FormAnalysisResult?
    var cooldownExs: [CooldownExercise]
    var riskHistory: [Int]

    var grade: (grade: String, color: String, label: String) {
        if score >= 95 { return ("S", "#a78bfa", "Perfect")   }
        if score >= 85 { return ("A", "#22c55e", "Excellent") }
        if score >= 70 { return ("B", "#3b82f6", "Great")     }
        if score >= 55 { return ("C", "#f59e0b", "Good")      }
        if score >= 40 { return ("D", "#f97316", "Fair")      }
        return              ("F", "#ef4444", "Needs Work")
    }

    var earnedBadges: [BadgeDef] {
        checkBadges()
    }

    private func checkBadges() -> [BadgeDef] {
        var out: [BadgeDef] = []
        let existing = (UserDefaults.standard.array(forKey: "earnedBadges") as? [String]) ?? []
        let saved = UserDefaults.standard.integer(forKey: "totalSessions")
        let streak = UserDefaults.standard.integer(forKey: "currentStreak")
        let totalReps = session.repCount

        func check(_ id: String, _ condition: Bool) {
            if condition && !existing.contains(id) {
                if let b = ALL_BADGES.first(where: { $0.id == id }) { out.append(b) }
            }
        }
        check("first_workout",  saved == 1)
        check("perfect_form",   score >= 90)
        check("century",        totalReps >= 100)
        check("iron_week",      streak >= 7)
        check("risk_master",    Int(session.avgRiskScore) < 20 && totalReps > 0)
        check("marathon",       session.duration >= 1800)
        check("veteran",        saved >= 10)
        return out
    }
}

struct BadgeDef: Identifiable {
    var id:          String
    var name:        String
    var description: String
    var icon:        String
}

let ALL_BADGES: [BadgeDef] = [
    BadgeDef(id: "first_workout",  name: "First Step",      description: "Complete your first workout",       icon: "🚀"),
    BadgeDef(id: "perfect_form",   name: "Perfect Form",    description: "Score 90+ in a single session",     icon: "✨"),
    BadgeDef(id: "century",        name: "Century Club",    description: "100+ reps in a single session",     icon: "💯"),
    BadgeDef(id: "iron_week",      name: "Iron Week",       description: "7-day workout streak",              icon: "🔥"),
    BadgeDef(id: "iron_month",     name: "Iron Month",      description: "30-day workout streak",             icon: "⚡"),
    BadgeDef(id: "cooldown_habit", name: "Cool Operator",   description: "Complete cooldown in 3 sessions",   icon: "🧊"),
    BadgeDef(id: "risk_master",    name: "Risk Master",     description: "Avg risk below 20 in a session",    icon: "🎯"),
    BadgeDef(id: "marathon",       name: "Marathon Session",description: "Complete a 30+ minute workout",     icon: "⏱️"),
    BadgeDef(id: "socialite",      name: "Squad Goals",     description: "Add 3 friends to your squad",       icon: "🤝"),
    BadgeDef(id: "veteran",        name: "Veteran",         description: "Complete 10 workouts",              icon: "🏅"),
    BadgeDef(id: "challenger",     name: "Challenger",      description: "Complete a weekly challenge",       icon: "🏆"),
    BadgeDef(id: "no_risk",        name: "Ghost Mode",      description: "Full session with 0 risk events",   icon: "👻"),
]
