import SwiftUI

struct RecoveryLogView: View {
    @EnvironmentObject private var appState: AppState
    @State private var logs:      [DailyLog] = []
    @State private var sleep:     Double = 7
    @State private var soreness   = 3
    @State private var energy     = 7
    @State private var rpe        = 6
    @State private var notes      = ""
    @State private var soreMuscles: Set<String> = []
    @State private var saved      = false

    private var readiness: Int {
        // Mirror web formula: sleep 40%, energy 40%, soreness 20%
        let sleepScore    = min(sleep / 9.0, 1.0) * 40
        let energyScore   = Double(energy)  / 10.0 * 40
        let sorenessScore = (1 - Double(soreness) / 10.0) * 20
        return Int(sleepScore + energyScore + sorenessScore)
    }

    private var readinessLabel: (String, Color) {
        if readiness >= 80 { return ("Peak",  .green)  }
        if readiness >= 55 { return ("Good",  .yellow) }
        return ("Rest", .red)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    readinessGauge
                    logForm
                    bodyMap
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

    // MARK: - Readiness gauge

    private var readinessGauge: some View {
        let (label, color) = readinessLabel
        return VStack(spacing: 10) {
            ZStack {
                // Background arc
                Circle()
                    .trim(from: 0.15, to: 0.85)
                    .stroke(Color.white.opacity(0.08), style: StrokeStyle(lineWidth: 14, lineCap: .round))
                    .rotationEffect(.degrees(90))
                // Value arc
                Circle()
                    .trim(from: 0.15, to: 0.15 + 0.70 * CGFloat(readiness) / 100)
                    .stroke(color, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                    .rotationEffect(.degrees(90))
                    .animation(.spring(), value: readiness)
                VStack(spacing: 2) {
                    Text("\(readiness)")
                        .font(.system(size: 36, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                    Text(label)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(color)
                }
            }
            .frame(width: 140, height: 140)

            Text("Readiness Score")
                .font(.system(size: 11, weight: .semibold)).foregroundColor(.gray)
                .textCase(.uppercase).tracking(1)
        }
        .frame(maxWidth: .infinity).padding()
        .background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Log form

    private var logForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionLabel("Today's Metrics")
            SliderRow(label: "Sleep", value: $sleep, range: 0...12, step: 0.5, format: "%.1f hrs")
            SliderRow(label: "Soreness", value: .init(get: { Double(soreness) }, set: { soreness = Int($0) }),
                      range: 1...10, step: 1, format: "%.0f / 10")
            SliderRow(label: "Energy", value: .init(get: { Double(energy) }, set: { energy = Int($0) }),
                      range: 1...10, step: 1, format: "%.0f / 10")
            SliderRow(label: "RPE", value: .init(get: { Double(rpe) }, set: { rpe = Int($0) }),
                      range: 1...10, step: 1, format: "%.0f / 10")

            VStack(alignment: .leading, spacing: 6) {
                sectionLabel("Notes")
                TextField("How are you feeling?", text: $notes, axis: .vertical)
                    .font(.system(size: 14)).foregroundColor(.white)
                    .padding(12).background(Color("Background"))
                    .clipShape(RoundedRectangle(cornerRadius: 10)).lineLimit(3)
            }

            Button { Task { await save() } } label: {
                Text(saved ? "Logged ✓" : "Log Today")
                    .font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(saved ? Color.green : Color("Accent"))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Body soreness map

    private let muscleGroups: [[String]] = [
        ["Neck", "Traps"],
        ["Left Shoulder", "Right Shoulder"],
        ["Chest", "Upper Back"],
        ["Left Bicep", "Right Bicep"],
        ["Left Tricep", "Right Tricep"],
        ["Core / Abs", "Lower Back"],
        ["Left Glute", "Right Glute"],
        ["Left Quad", "Right Quad"],
        ["Left Hamstring", "Right Hamstring"],
        ["Left Calf", "Right Calf"],
    ]

    private var bodyMap: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Sore Spots (tap to select)")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(muscleGroups.flatMap { $0 }, id: \.self) { muscle in
                    let selected = soreMuscles.contains(muscle)
                    Button {
                        if selected { soreMuscles.remove(muscle) }
                        else        { soreMuscles.insert(muscle) }
                    } label: {
                        Text(muscle)
                            .font(.system(size: 12, weight: selected ? .bold : .regular))
                            .foregroundColor(selected ? .white : .gray)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(selected ? Color.red.opacity(0.25) : Color("Background"))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(selected ? Color.red.opacity(0.5) : Color.clear, lineWidth: 1)
                            )
                    }
                }
            }
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Recent logs

    private var recentLogs: some View {
        VStack(alignment: .leading, spacing: 10) {
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

    // MARK: - Actions

    private func save() async {
        guard let uid = appState.currentUser?.uid else { return }
        let log = DailyLog(
            id: UUID().uuidString, date: .now,
            sleep: sleep, soreness: soreness, energy: energy, rpe: rpe,
            notes: notes.isEmpty ? soreMuscles.joined(separator: ", ") : notes
        )
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
