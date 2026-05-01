import SwiftUI

struct RootView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Group {
            if appState.isLoading {
                LoadingView()
            } else if appState.currentUser == nil {
                AuthView()
            } else {
                MainTabView()
            }
        }
        .animation(.easeInOut(duration: 0.2), value: appState.currentUser?.uid)
    }
}

struct MainTabView: View {
    @State private var selected = 0

    var body: some View {
        TabView(selection: $selected) {
            HomeView()
                .tabItem { Label("Today", systemImage: "house.fill") }
                .tag(0)

            WorkoutView()
                .tabItem { Label("Workout", systemImage: "figure.run") }
                .tag(1)

            ProgressView()
                .tabItem { Label("Progress", systemImage: "chart.bar.fill") }
                .tag(2)

            ChatView()
                .tabItem { Label("Coach", systemImage: "bubble.left.and.bubble.right.fill") }
                .tag(3)

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.fill") }
                .tag(4)
        }
        .tint(Color("Accent"))
    }
}
