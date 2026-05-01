import Foundation
import UIKit

private let baseURL = "https://intoyourprime.vercel.app"

enum AIError: Error { case notSubscribed, limitReached, network, decode }

final class AIService {
    static let shared = AIService()

    // MARK: - Analyze form frames (Pro path → Vercel /api/analyze)

    func analyzeForm(
        frames:      [String],
        exercise:    String,
        repCount:    Int,
        userProfile: UserProfile,
        phase:       String
    ) async throws -> FormAnalysisResult {
        let token = try await AuthService.shared.idToken()
        let body: [String: Any] = [
            "frames":      frames,
            "exercise":    exercise,
            "repCount":    repCount,
            "userProfile": ["age": userProfile.age, "weight": userProfile.weight, "fitnessLevel": userProfile.fitnessLevel],
            "phase":       phase,
        ]
        return try await post(path: "/api/analyze", body: body, token: token)
    }

    // MARK: - Generate cooldown

    func generateCooldown(session: WorkoutSession, userProfile: UserProfile) async throws -> [CooldownExercise] {
        let token = try await AuthService.shared.idToken()
        let body: [String: Any] = [
            "session":     ["exercise": session.exercise, "repCount": session.repCount, "duration": session.duration],
            "userProfile": ["age": userProfile.age, "weight": userProfile.weight, "fitnessLevel": userProfile.fitnessLevel],
        ]
        return try await post(path: "/api/cooldown", body: body, token: token)
    }

    // MARK: - Recovery insight

    func recoveryInsight(sessions: [WorkoutSession], logs: [DailyLog]) async throws -> String {
        let token = try await AuthService.shared.idToken()
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let sessionsData = try encoder.encode(sessions)
        let logsData     = try encoder.encode(logs)
        let body: [String: Any] = [
            "sessions": try JSONSerialization.jsonObject(with: sessionsData),
            "logs":     try JSONSerialization.jsonObject(with: logsData),
        ]
        let resp: [String: String] = try await post(path: "/api/recovery-insight", body: body, token: token)
        return resp["insight"] ?? ""
    }

    // MARK: - AI Trainer Chat

    func chat(messages: [[String: String]], userProfile: UserProfile) async throws -> String {
        let token = try await AuthService.shared.idToken()
        let body: [String: Any] = [
            "messages":    messages,
            "userProfile": ["age": userProfile.age, "weight": userProfile.weight, "fitnessLevel": userProfile.fitnessLevel],
        ]
        let resp: [String: String] = try await post(path: "/api/chat", body: body, token: token)
        return resp["message"] ?? ""
    }

    // MARK: - AI Workout generation

    func generateWorkout(goals: String, daysPerWeek: Int, userProfile: UserProfile) async throws -> WorkoutProgram {
        let token = try await AuthService.shared.idToken()
        let body: [String: Any] = [
            "goals":       goals,
            "daysPerWeek": daysPerWeek,
            "userProfile": ["age": userProfile.age, "weight": userProfile.weight, "fitnessLevel": userProfile.fitnessLevel],
        ]
        return try await post(path: "/api/generate-workout", body: body, token: token)
    }

    // MARK: - Checkout

    func createCheckoutURL(uid: String, email: String) async throws -> URL {
        let token = try await AuthService.shared.idToken()
        let body: [String: Any] = ["uid": uid, "email": email]
        let resp: [String: String] = try await post(path: "/api/ls-checkout", body: body, token: token)
        guard let urlString = resp["checkoutUrl"], let url = URL(string: urlString) else {
            throw AIError.decode
        }
        return url
    }

    // MARK: - Shared request helper

    private func post<T: Decodable>(path: String, body: [String: Any], token: String) async throws -> T {
        guard let url = URL(string: baseURL + path) else { throw AIError.network }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: req)

        if let http = response as? HTTPURLResponse {
            if http.statusCode == 403 { throw AIError.notSubscribed }
            if http.statusCode == 429 { throw AIError.limitReached  }
            if http.statusCode >= 400 { throw AIError.network        }
        }

        return try JSONDecoder().decode(T.self, from: data)
    }
}
