import SwiftUI

struct FriendsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var friends: [FriendUser] = []
    @State private var searchUID = ""
    @State private var loading   = false

    var body: some View {
        NavigationStack {
            List {
                if friends.isEmpty {
                    Text("No friends yet. Add someone by their UID!")
                        .font(.system(size: 13))
                        .foregroundColor(.gray)
                        .listRowBackground(Color("Background"))
                } else {
                    ForEach(friends) { friend in
                        HStack {
                            ZStack {
                                Circle().fill(Color("Accent").opacity(0.15)).frame(width: 40, height: 40)
                                Text(String(friend.displayName.prefix(1)).uppercased())
                                    .font(.system(size: 16, weight: .bold)).foregroundColor(Color("Accent"))
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(friend.displayName).font(.system(size: 14, weight: .semibold)).foregroundColor(.white)
                                Text("🔥 \(friend.streak) day streak").font(.system(size: 11)).foregroundColor(.gray)
                            }
                        }
                        .listRowBackground(Color("Surface"))
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color("Background"))
            .navigationTitle("Friends")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink(destination: LeaderboardView()) {
                        Image(systemName: "trophy.fill")
                    }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        guard let uid = appState.currentUser?.uid else { return }
        friends = (try? await FirestoreService.shared.fetchFriends(uid: uid)) ?? []
    }
}
