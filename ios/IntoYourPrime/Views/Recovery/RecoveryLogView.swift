import SwiftUI

struct RecoveryLogView: View {
    @EnvironmentObject private var appState: AppState
    @State private var logs:    [DailyLog] = []
    @State private var sleep:   Double = 7
    @State private var soreness = 3
    @State private var energy   = 7
    @State private var rpe      = 6
    @State private var notes    = ""
    @State private var saved    = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    logForm
                    recentLogs
                }
                .padding()
            }
            .background(Color("Background"))
            .navigationTitle("Recovery Log")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await loadLogs() }
    }

    private var logForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionLabel("Today")

            SliderRow(label: "Sleep", value: $sleep, range: 0...12, step: 0.5, format: "%.1f hrs")
            SliderRow(label: "Soreness", value: .init(get: { Double(soreness) }, set: { soreness = Int($0) }),
                      range: 1...10, step: 1, format: "%.0f/10")
            SliderRow(label: "Energy", value: .init(get: { Double(energy) }, set: { energy = Int($0) }),
                      range: 1...10, step: 1, format: "%.0f/10")
            SliderRow(label: "RPE", value: .init(get: { Double(rpe) }, set: { rpe = Int($0) }),
                      range: 1...10, step: 1, format: "%.0f/10")

            VStack(alignment: .leading, spacing: 6) {
                Text("Notes").font(.system(size: 11, weight: .semibold)).foregroundColor(.gray).textCase(.uppercase).tracking(1)
                TextField("How are you feeling?", text: $notes, axis: .vertical)
                    .font(.system(size: 14)).foregroundColor(.white)
                    .padding(12).background(Color("Background"))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .lineLimit(3)
            }

            Button {
                Task { await save() }
            } label: {
                Text(saved ? "Logged ✓" : "Log Today")
                    .font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(saved ? Color.green : Color("Accent"))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var recentLogs: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Recent")
            ForEach(logs.prefix(7)) { log in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(log.date.formatted(date: .abbreviated, time: .omitted))
                            .font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
                        Text("Sleep: \(log.sleep, specifier: "%.1f")h · Soreness: \(log.soreness) · Energy: \(log.energy)")
                            .font(.system(size: 11)).foregroundColor(.gray)
                    }
                    Spacer()
                    Text("RPE \(log.rpe)")
                        .font(.system(size: 12, weight: .bold)).foregroundColor(Color("Accent"))
                }
                .padding(12).background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func save() async {
        guard let uid = appState.currentUser?.uid else { return }
        let log = DailyLog(id: UUID().uuidString, date: .now,
                           sleep: sleep, soreness: soreness, energy: energy, rpe: rpe, notes: notes)
        try? await FirestoreService.shared.saveLog(log, uid: uid)
        logs.insert(log, at: 0)
        saved = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saved = false }
    }

    private func loadLogs() async {
        guard let uid = appState.currentUser?.uid else { return }
        logs = (try? await FirestoreService.shared.fetchLogs(uid: uid)) ?? []
    }
}

struct SliderRow: View {
    let label:  String
    @Binding var value: Double
    let range:  ClosedRange<Double>
    let step:   Double
    let format: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label).font(.system(size: 11, weight: .semibold)).foregroundColor(.gray).textCase(.uppercase).tracking(1)
                Spacer()
                Text(String(format: format, value)).font(.system(size: 13, weight: .bold)).foregroundColor(Color("Accent"))
            }
            Slider(value: $value, in: range, step: step).tint(Color("Accent"))
        }
    }
}
