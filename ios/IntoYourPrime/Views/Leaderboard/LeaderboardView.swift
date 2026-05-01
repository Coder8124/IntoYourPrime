import SwiftUI

struct LeaderboardView: View {
    @State private var entries: [FriendUser] = []

    var body: some View {
        List {
            ForEach(Array(entries.enumerated()), id: \.element.id) { idx, user in
                HStack(spacing: 14) {
                    Text("\(idx + 1)")
                        .font(.system(size: 16, weight: .black))
                        .foregroundColor(idx == 0 ? .yellow : idx == 1 ? .gray : .orange)
                        .frame(width: 28)
                    Text(user.displayName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                    Spacer()
                    Text("🔥 \(user.streak)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Color("Accent"))
                }
                .listRowBackground(Color("Surface"))
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color("Background"))
        .navigationTitle("Leaderboard")
        .navigationBarTitleDisplayMode(.inline)
    }
}
