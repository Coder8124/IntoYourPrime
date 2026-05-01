import SwiftUI
import Charts

// Named ProgressDashboardView to avoid conflict with SwiftUI's built-in ProgressView.
struct ProgressDashboardView: View {
    @EnvironmentObject private var appState: AppState
    @State private var sessions:  [WorkoutSession] = []
    @State private var logs:      [DailyLog]       = []
    @State private var isLoading  = true

    private var totalReps: Int { sessions.reduce(0) { $0 + $1.repCount } }
    private var avgRisk:   Int {
        sessions.isEmpty ? 0 : sessions.reduce(0) { $0 + Int($1.avgRiskScore) } / sessions.count
    }
    private var streak: Int {
        UserDefaults.standard.integer(forKey: "currentStreak")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if isLoading {
                    VStack { SwiftUI.ProgressView().tint(Color("Accent")).padding(.top, 40) }
                } else {
                    VStack(spacing: 20) {
                        statsRow
                        if sessions.count >= 2 { riskChart    }
                        if sessions.count >= 2 { volumeChart  }
                        if logs.count >= 2     { recoveryChart }
                        personalBests
                        NavigationLink("Measurements →", destination: MeasurementsView())
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color("Accent"))
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    .padding()
                }
            }
            .background(Color("Background"))
            .navigationTitle("Progress")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await load() }
    }

    // MARK: - Stats

    private var statsRow: some View {
        HStack(spacing: 12) {
            StatCard(label: "Sessions", value: "\(sessions.count)")
            StatCard(label: "Total Reps", value: totalReps > 999 ? "\(totalReps/1000)k" : "\(totalReps)")
            StatCard(label: "Avg Risk", value: sessions.isEmpty ? "—" : "\(avgRisk)")
            StatCard(label: "Streak 🔥", value: "\(streak)d")
        }
    }

    // MARK: - Charts

    private var riskChart: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Form Risk Trend")
            Chart(sessions.suffix(15)) { s in
                LineMark(
                    x: .value("Date", s.date),
                    y: .value("Risk", s.avgRiskScore)
                ).foregroundStyle(Color("Accent"))
                AreaMark(
                    x: .value("Date", s.date),
                    y: .value("Risk", s.avgRiskScore)
                ).foregroundStyle(Color("Accent").opacity(0.1))
            }
            .chartYScale(domain: 0...100)
            .frame(height: 140)
            Text("Lower is better — aim for below 30")
                .font(.system(size: 10)).foregroundColor(.gray)
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var volumeChart: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Weekly Volume (reps)")
            let weekly = groupByWeek(sessions: sessions)
            Chart(weekly, id: \.0) { week, reps in
                BarMark(x: .value("Week", week), y: .value("Reps", reps))
                    .foregroundStyle(Color("Accent"))
            }
            .frame(height: 120)
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var recoveryChart: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Sleep & Energy")
            Chart(logs.suffix(10)) { log in
                BarMark(x: .value("Date", log.date, unit: .day), y: .value("Sleep", log.sleep))
                    .foregroundStyle(Color.blue.opacity(0.5))
                LineMark(x: .value("Date", log.date, unit: .day), y: .value("Energy", Double(log.energy)))
                    .foregroundStyle(Color("Accent"))
            }
            .frame(height: 120)
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Personal bests

    private var personalBests: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Personal Bests")
            let grouped = Dictionary(grouping: sessions, by: \.exercise)
            ForEach(grouped.keys.sorted(), id: \.self) { ex in
                let best = grouped[ex]!.max(by: { $0.repCount < $1.repCount })!
                HStack {
                    Text(ex.capitalized).font(.system(size: 13)).foregroundColor(.white)
                    Spacer()
                    Text("\(best.repCount) reps")
                        .font(.system(size: 13, weight: .bold)).foregroundColor(Color("Accent"))
                }
                .padding(10).background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    // MARK: - Helpers

    private func groupByWeek(sessions: [WorkoutSession]) -> [(String, Int)] {
        let calendar = Calendar.current
        var groups: [String: Int] = [:]
        for s in sessions {
            let week = calendar.component(.weekOfYear, from: s.date)
            let year = calendar.component(.year, from: s.date)
            let key  = "\(year)-W\(week)"
            groups[key, default: 0] += s.repCount
        }
        return groups.sorted(by: { $0.key < $1.key })
    }

    private func load() async {
        guard let uid = appState.currentUser?.uid else { isLoading = false; return }
        async let s = FirestoreService.shared.fetchSessions(uid: uid, limit: 50)
        async let l = FirestoreService.shared.fetchLogs(uid: uid, limit: 14)
        sessions = (try? await s) ?? []
        logs     = (try? await l) ?? []
        isLoading = false
    }
}
