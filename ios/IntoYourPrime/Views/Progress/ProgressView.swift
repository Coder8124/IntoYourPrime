import SwiftUI
import Charts

struct ProgressView: View {
    @EnvironmentObject private var appState: AppState
    @State private var sessions: [WorkoutSession] = []
    @State private var logs:     [DailyLog]       = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    statsRow
                    if !sessions.isEmpty { riskChart }
                    if !logs.isEmpty     { recoveryChart }
                    NavigationLink("Measurements →", destination: MeasurementsView())
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color("Accent"))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .padding()
            }
            .background(Color("Background"))
            .navigationTitle("Progress")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await load() }
    }

    private var statsRow: some View {
        HStack(spacing: 12) {
            StatCard(label: "Sessions", value: "\(sessions.count)")
            StatCard(label: "Total Reps", value: "\(sessions.reduce(0) { $0 + $1.repCount })")
            StatCard(label: "Avg Risk", value: sessions.isEmpty ? "—" : "\(Int(sessions.map(\.avgRiskScore).reduce(0,+) / Double(sessions.count)))")
        }
    }

    private var riskChart: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Risk Score Over Time")
            Chart(sessions.suffix(10)) { s in
                LineMark(
                    x: .value("Date", s.date),
                    y: .value("Risk", s.avgRiskScore)
                )
                .foregroundStyle(Color("Accent"))
                PointMark(
                    x: .value("Date", s.date),
                    y: .value("Risk", s.avgRiskScore)
                )
                .foregroundStyle(Color("Accent"))
            }
            .chartYScale(domain: 0...100)
            .frame(height: 160)
        }
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var recoveryChart: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Sleep & Energy")
            Chart(logs.suffix(10)) { log in
                BarMark(x: .value("Date", log.date, unit: .day), y: .value("Sleep", log.sleep))
                    .foregroundStyle(Color.blue.opacity(0.6))
                LineMark(x: .value("Date", log.date, unit: .day), y: .value("Energy", Double(log.energy)))
                    .foregroundStyle(Color("Accent"))
            }
            .frame(height: 140)
        }
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func load() async {
        guard let uid = appState.currentUser?.uid else { return }
        async let s = FirestoreService.shared.fetchSessions(uid: uid, limit: 30)
        async let l = FirestoreService.shared.fetchLogs(uid: uid, limit: 14)
        sessions = (try? await s) ?? []
        logs     = (try? await l) ?? []
    }
}

struct StatCard: View {
    let label: String
    let value: String
    var body: some View {
        VStack(spacing: 4) {
            Text(value).font(.system(size: 22, weight: .black)).foregroundColor(.white)
            Text(label).font(.system(size: 10, weight: .semibold)).foregroundColor(.gray).textCase(.uppercase).tracking(1)
        }
        .frame(maxWidth: .infinity).padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
