import SwiftUI
import FirebaseFirestore

struct FriendsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var friends: [FriendUser] = []
    @State private var searchUID  = ""
    @State private var searchResult: FriendUser?
    @State private var searching  = false
    @State private var adding     = false
    @State private var searchError = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Search by User ID", text: $searchUID)
                            .foregroundColor(.white).font(.system(size: 14))
                            .autocapitalization(.none).disableAutocorrection(true)
                        if searching {
                            SwiftUI.ProgressView().tint(Color("Accent"))
                        } else {
                            Button("Find") { Task { await search() } }
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(Color("Accent"))
                                .disabled(searchUID.isEmpty)
                        }
                    }
                    .padding(10).listRowBackground(Color("Surface"))

                    if !searchError.isEmpty {
                        Text(searchError).font(.system(size: 12)).foregroundColor(.red)
                            .listRowBackground(Color("Surface"))
                    }

                    if let result = searchResult {
                        HStack {
                            Text(result.displayName).font(.system(size: 14)).foregroundColor(.white)
                            Spacer()
                            Button {
                                Task { await addFriend(result) }
                            } label: {
                                Text(adding ? "Adding…" : "Add Friend")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .background(Color("Accent")).clipShape(Capsule())
                            }
                            .disabled(adding)
                        }
                        .listRowBackground(Color("Surface"))
                    }
                } header: {
                    Text("Find Friends").foregroundColor(.gray)
                }

                Section {
                    if friends.isEmpty {
                        Text("No friends yet. Add someone by their user ID!")
                            .font(.system(size: 13)).foregroundColor(.gray)
                            .listRowBackground(Color("Background"))
                    } else {
                        ForEach(friends) { friend in
                            NavigationLink(destination: PublicProfileView(uid: friend.id)) {
                                HStack {
                                    ZStack {
                                        Circle().fill(Color("Accent").opacity(0.15)).frame(width: 40, height: 40)
                                        Text(String(friend.displayName.prefix(1)).uppercased())
                                            .font(.system(size: 16, weight: .bold)).foregroundColor(Color("Accent"))
                                    }
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(friend.displayName)
                                            .font(.system(size: 14, weight: .semibold)).foregroundColor(.white)
                                        Text("🔥 \(friend.streak) day streak")
                                            .font(.system(size: 11)).foregroundColor(.gray)
                                    }
                                }
                            }
                            .listRowBackground(Color("Surface"))
                        }
                    }
                } header: {
                    Text("My Squad").foregroundColor(.gray)
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

    private func search() async {
        guard !searchUID.isEmpty else { return }
        searching = true; searchResult = nil; searchError = ""
        defer { searching = false }
        let db  = Firestore.firestore()
        let doc = try? await db.collection("users").document(searchUID).getDocument()
        if let d = doc?.data() {
            searchResult = FriendUser(
                id: searchUID,
                displayName: d["displayName"] as? String ?? d["name"] as? String ?? "User",
                streak: d["streak"] as? Int ?? 0
            )
        } else {
            searchError = "User not found."
        }
    }

    private func addFriend(_ friend: FriendUser) async {
        guard let uid = appState.currentUser?.uid else { return }
        adding = true
        defer { adding = false }
        let db = Firestore.firestore()
        try? await db.collection("users").document(uid)
                     .collection("friends").document(friend.id)
                     .setData(["displayName": friend.displayName, "streak": friend.streak])
        friends.append(friend)
        searchResult = nil; searchUID = ""
    }

    private func load() async {
        guard let uid = appState.currentUser?.uid else { return }
        friends = (try? await FirestoreService.shared.fetchFriends(uid: uid)) ?? []
    }
}

struct PublicProfileView: View {
    let uid: String
    @State private var profile:  UserProfile?
    @State private var sessions: [WorkoutSession] = []

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if let p = profile {
                    VStack(spacing: 8) {
                        ZStack {
                            Circle().fill(Color("Accent").opacity(0.15)).frame(width: 72, height: 72)
                            Text(String(p.name.prefix(1)).uppercased())
                                .font(.system(size: 28, weight: .black)).foregroundColor(Color("Accent"))
                        }
                        Text(p.name).font(.system(size: 20, weight: .bold)).foregroundColor(.white)
                        Text(p.fitnessLevel.capitalized)
                            .font(.system(size: 12)).foregroundColor(.gray)
                    }
                    .frame(maxWidth: .infinity).padding()
                    .background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))

                    HStack(spacing: 12) {
                        StatCard(label: "Sessions", value: "\(sessions.count)")
                        StatCard(label: "Total Reps", value: "\(sessions.reduce(0) { $0 + $1.repCount })")
                    }
                }

                if !sessions.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        sectionLabel("Recent Activity")
                        ForEach(sessions.prefix(5)) { SessionRow(session: $0) }
                    }
                }
            }
            .padding()
        }
        .background(Color("Background"))
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        profile  = try? await FirestoreService.shared.fetchProfile(uid: uid)
        sessions = (try? await FirestoreService.shared.fetchSessions(uid: uid, limit: 10)) ?? []
    }
}
