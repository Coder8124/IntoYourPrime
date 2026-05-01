import SwiftUI
import FirebaseFirestore

struct LeaderboardEntry: Identifiable {
    var id:          String
    var displayName: String
    var streak:      Int
    var totalReps:   Int
    var sessions:    Int
}

struct LeaderboardView: View {
    @State private var entries: [LeaderboardEntry] = []
    @State private var scope:   Scope = .allTime
    @State private var isLoading = true

    enum Scope: String, CaseIterable { case allTime = "All-Time"; case weekly = "This Week" }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Scope", selection: $scope) {
                    ForEach(Scope.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented).padding()

                if isLoading {
                    Spacer()
                    SwiftUI.ProgressView().tint(Color("Accent"))
                    Spacer()
                } else {
                    List {
                        ForEach(Array(entries.enumerated()), id: \.element.id) { idx, user in
                            HStack(spacing: 14) {
                                // Rank
                                Text(rankEmoji(idx))
                                    .font(.system(size: idx < 3 ? 22 : 16, weight: .black))
                                    .frame(width: 32, alignment: .center)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(user.displayName)
                                        .font(.system(size: 14, weight: .semibold)).foregroundColor(.white)
                                    Text("\(user.sessions) sessions · \(user.totalReps) reps")
                                        .font(.system(size: 11)).foregroundColor(.gray)
                                }
                                Spacer()
                                Text("🔥 \(user.streak)")
                                    .font(.system(size: 13, weight: .bold)).foregroundColor(Color("Accent"))
                            }
                            .listRowBackground(Color("Surface"))
                        }
                    }
                    .listStyle(.insetGrouped).scrollContentBackground(.hidden)
                }
            }
            .background(Color("Background"))
            .navigationTitle("Leaderboard")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await load() }
        .onChange(of: scope) { _, _ in Task { await load() } }
    }

    private func rankEmoji(_ idx: Int) -> String {
        switch idx { case 0: return "🥇"; case 1: return "🥈"; case 2: return "🥉"; default: return "\(idx+1)" }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }

        let db  = Firestore.firestore()
        let snap = try? await db.collection("users")
                                .order(by: "streak", descending: true)
                                .limit(to: 50)
                                .getDocuments()

        guard let snap else { return }

        entries = snap.documents.compactMap { doc -> LeaderboardEntry? in
            let d = doc.data()
            guard let name = d["displayName"] as? String ?? d["name"] as? String else { return nil }
            return LeaderboardEntry(
                id:          doc.documentID,
                displayName: name,
                streak:      d["streak"]     as? Int ?? 0,
                totalReps:   d["totalReps"]  as? Int ?? 0,
                sessions:    d["totalSessions"] as? Int ?? 0
            )
        }
    }
}
