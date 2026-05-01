import FirebaseFirestore
import FirebaseAuth

final class FirestoreService {
    static let shared = FirestoreService()
    let db = Firestore.firestore()

    // MARK: - Sessions

    func saveSession(_ session: WorkoutSession, uid: String) async throws {
        let encoder = Firestore.Encoder()
        let data    = try encoder.encode(session)
        try await db.collection("users").document(uid)
                    .collection("sessions").document(session.id)
                    .setData(data)
    }

    func fetchSessions(uid: String, limit: Int = 20) async throws -> [WorkoutSession] {
        let snap = try await db.collection("users").document(uid)
                               .collection("sessions")
                               .order(by: "date", descending: true)
                               .limit(to: limit)
                               .getDocuments()
        return try snap.documents.compactMap { try $0.data(as: WorkoutSession.self) }
    }

    // MARK: - Daily logs

    func saveLog(_ log: DailyLog, uid: String) async throws {
        let encoder = Firestore.Encoder()
        let data    = try encoder.encode(log)
        try await db.collection("users").document(uid)
                    .collection("logs").document(log.id)
                    .setData(data)
    }

    func fetchLogs(uid: String, limit: Int = 14) async throws -> [DailyLog] {
        let snap = try await db.collection("users").document(uid)
                               .collection("logs")
                               .order(by: "date", descending: true)
                               .limit(to: limit)
                               .getDocuments()
        return try snap.documents.compactMap { try $0.data(as: DailyLog.self) }
    }

    // MARK: - User profile

    func saveProfile(_ profile: UserProfile, uid: String) async throws {
        let data: [String: Any] = [
            "name":         profile.name,
            "age":          profile.age,
            "weight":       profile.weight,
            "fitnessLevel": profile.fitnessLevel,
            "email":        profile.email,
        ]
        try await db.collection("users").document(uid).setData(data, merge: true)
    }

    func fetchProfile(uid: String) async throws -> UserProfile? {
        let doc = try await db.collection("users").document(uid).getDocument()
        guard doc.exists, let d = doc.data() else { return nil }
        return UserProfile(
            name:         d["name"]         as? String ?? "",
            age:          d["age"]          as? Int    ?? 25,
            weight:       d["weight"]       as? Double ?? 70,
            fitnessLevel: d["fitnessLevel"] as? String ?? "intermediate",
            email:        d["email"]        as? String ?? ""
        )
    }

    // MARK: - Measurements

    func saveMeasurement(_ m: Measurement, uid: String) async throws {
        let encoder = Firestore.Encoder()
        let data    = try encoder.encode(m)
        try await db.collection("users").document(uid)
                    .collection("measurements").document(m.id)
                    .setData(data)
    }

    func fetchMeasurements(uid: String) async throws -> [Measurement] {
        let snap = try await db.collection("users").document(uid)
                               .collection("measurements")
                               .order(by: "date", descending: true)
                               .limit(to: 30)
                               .getDocuments()
        return try snap.documents.compactMap { try $0.data(as: Measurement.self) }
    }

    // MARK: - Friends

    func fetchFriends(uid: String) async throws -> [FriendUser] {
        let snap = try await db.collection("users").document(uid)
                               .collection("friends")
                               .getDocuments()
        return snap.documents.compactMap { doc in
            let d = doc.data()
            return FriendUser(
                id:          doc.documentID,
                displayName: d["displayName"] as? String ?? "User",
                streak:      d["streak"]      as? Int    ?? 0
            )
        }
    }
}
