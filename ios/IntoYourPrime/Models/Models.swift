import Foundation

struct UserProfile: Codable {
    var name:         String
    var age:          Int
    var weight:       Double  // kg
    var fitnessLevel: String  // "beginner" | "intermediate" | "advanced"
    var email:        String
}

struct FormAnalysisResult: Codable {
    var riskScore:        Int
    var suggestions:      [String]
    var safetyConcerns:   [String]
    var repCountEstimate: Int
    var dominantIssue:    String?
    var warmupQuality:    Int?

    static let empty = FormAnalysisResult(
        riskScore: 0, suggestions: [], safetyConcerns: [],
        repCountEstimate: 0, dominantIssue: nil, warmupQuality: nil
    )
}

struct CooldownExercise: Codable, Identifiable {
    var id: String { name }
    var name:            String
    var durationSeconds: Int
    var targetMuscles:   [String]
    var instruction:     String
}

struct WorkoutSession: Codable, Identifiable {
    var id:           String
    var exercise:     String
    var date:         Date
    var repCount:     Int
    var avgRiskScore: Double
    var duration:     TimeInterval
}

struct DailyLog: Codable, Identifiable {
    var id:        String
    var date:      Date
    var sleep:     Double   // hours
    var soreness:  Int      // 1-10
    var energy:    Int      // 1-10
    var rpe:       Int      // 1-10
    var notes:     String
}

struct SubscriptionStatus: Codable {
    var status:           String   // "active" | "cancelled" | "expired" | "none"
    var currentPeriodEnd: String?
    var usagePct:         Int

    var isActive: Bool { status == "active" }
}

struct ChatMessage: Identifiable {
    var id   = UUID()
    var role: String  // "user" | "assistant"
    var text: String
    var date = Date()
}

struct WorkoutProgram: Codable, Identifiable {
    var id:          String
    var name:        String
    var description: String
    var days:        [ProgramDay]
}

struct ProgramDay: Codable, Identifiable {
    var id:        String
    var dayNumber: Int
    var exercises: [ProgramExercise]
}

struct ProgramExercise: Codable, Identifiable {
    var id:   String
    var name: String
    var sets: Int
    var reps: Int
    var notes: String
}

struct FriendUser: Identifiable {
    var id:          String
    var displayName: String
    var streak:      Int
}

struct Measurement: Codable, Identifiable {
    var id:     String
    var date:   Date
    var weight: Double
    var bodyFat: Double?
    var notes:  String
}

struct ShootingAttempt: Identifiable {
    var id = UUID()
    var made:      Bool
    var timestamp: Date
}
