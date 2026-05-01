import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var appState: AppState
    @State private var sessions: [WorkoutSession] = []
    @State private var insight:  String = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    greetingHeader
                    quickLinksGrid
                    ClipCoachCard()
                    if !insight.isEmpty { insightCard }
                    recentSessions
                }
                .padding()
            }
            .background(Color("Background"))
            .navigationBarHidden(true)
        }
        .task { await load() }
    }

    private var greetingHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(greeting)
                    .font(.system(size: 13, weight: .semibold)).foregroundColor(.gray)
                Text(appState.currentUser?.displayName?.components(separatedBy: " ").first ?? "Athlete")
                    .font(.system(size: 26, weight: .black)).foregroundColor(.white)
            }
            Spacer()
            NavigationLink(destination: ProfileView()) {
                Image(systemName: "person.circle.fill")
                    .font(.system(size: 30)).foregroundColor(Color("Accent"))
            }
        }
    }

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: .now)
        return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
    }

    private var quickLinksGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            QuickLink(icon: "figure.run",                title: "Start Workout", dest: AnyView(WorkoutView()))
            QuickLink(icon: "calendar",                  title: "Calendar",      dest: AnyView(WorkoutCalendarView()))
            QuickLink(icon: "chart.bar.fill",            title: "Progress",      dest: AnyView(ProgressDashboardView()))
            QuickLink(icon: "list.bullet.rectangle",     title: "Programs",      dest: AnyView(ProgramsView()))
            QuickLink(icon: "basketball",                title: "Basketball",    dest: AnyView(BasketballView()))
            QuickLink(icon: "books.vertical",            title: "Exercise Library", dest: AnyView(ExerciseLibraryView()))
            QuickLink(icon: "person.2.fill",             title: "Friends",       dest: AnyView(FriendsView()))
            QuickLink(icon: "note.text",                 title: "Recovery Log",  dest: AnyView(RecoveryLogView()))
        }
    }

    private var insightCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Recovery Insight", systemImage: "sparkles")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(Color("Accent")).textCase(.uppercase).tracking(1)
            Text(insight)
                .font(.system(size: 13)).foregroundColor(.white.opacity(0.85))
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var recentSessions: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Recent Sessions")
            if sessions.isEmpty {
                Text("No sessions yet — start your first workout!")
                    .font(.system(size: 13)).foregroundColor(.gray)
            } else {
                ForEach(sessions.prefix(3)) { SessionRow(session: $0) }
            }
        }
    }

    private func load() async {
        guard let uid = appState.currentUser?.uid else { return }
        sessions = (try? await FirestoreService.shared.fetchSessions(uid: uid)) ?? []
        if SubscriptionService.shared.isActive, sessions.count >= 2 {
            let logs = (try? await FirestoreService.shared.fetchLogs(uid: uid)) ?? []
            insight  = (try? await AIService.shared.recoveryInsight(sessions: sessions, logs: logs)) ?? ""
        }
    }
}

struct QuickLink: View {
    let icon:  String
    let title: String
    let dest:  AnyView

    var body: some View {
        NavigationLink(destination: dest) {
            VStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: 20)).foregroundColor(Color("Accent"))
                Text(title).font(.system(size: 12, weight: .semibold)).foregroundColor(.white)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 16)
            .background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }
}

struct SessionRow: View {
    let session: WorkoutSession
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.exercise.capitalized)
                    .font(.system(size: 14, weight: .semibold)).foregroundColor(.white)
                Text(session.date.formatted(date: .abbreviated, time: .omitted))
                    .font(.system(size: 11)).foregroundColor(.gray)
            }
            Spacer()
            Text("\(session.repCount) reps")
                .font(.system(size: 12, weight: .bold)).foregroundColor(Color("Accent"))
        }
        .padding(12).background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
