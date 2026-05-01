import Foundation
import FirebaseFirestore

struct CustomProgram: Codable, Identifiable {
    var id:             String
    var name:           String
    var description:    String
    var level:          String     // "Beginner" | "Intermediate" | "Advanced"
    var warmup:         [String]   // exercise IDs
    var exercises:      [String]   // exercise IDs (main set)
    var targetReps:     Int
    var targetHoldSecs: Int
    var createdAt:      Date

    var estimatedDuration: String {
        let total = warmup.count + exercises.count
        let mins  = Int((Double(total) * 2.5).rounded())
        return "\(mins) min"
    }
}

// MARK: - Persistence

extension FirestoreService {
    func saveCustomProgram(_ program: CustomProgram, uid: String) async throws {
        let encoder = Firestore.Encoder()
        let data    = try encoder.encode(program)
        try await db.collection("users").document(uid)
                    .collection("customPrograms").document(program.id)
                    .setData(data)
    }

    func fetchCustomPrograms(uid: String) async throws -> [CustomProgram] {
        let snap = try await db.collection("users").document(uid)
                               .collection("customPrograms")
                               .order(by: "createdAt", descending: true)
                               .getDocuments()
        return try snap.documents.compactMap { try $0.data(as: CustomProgram.self) }
    }

    func deleteCustomProgram(id: String, uid: String) async throws {
        try await db.collection("users").document(uid)
                    .collection("customPrograms").document(id)
                    .delete()
    }
}
