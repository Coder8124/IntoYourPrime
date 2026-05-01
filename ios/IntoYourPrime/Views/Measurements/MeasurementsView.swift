import SwiftUI
import Charts

struct MeasurementsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var measurements: [Measurement] = []
    @State private var weight   = ""
    @State private var bodyFat  = ""
    @State private var notes    = ""
    @State private var saved    = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    logForm
                    if measurements.count >= 2 { weightChart }
                    logList
                }
                .padding()
            }
            .background(Color("Background"))
            .navigationTitle("Measurements")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await load() }
    }

    private var logForm: some View {
        VStack(spacing: 14) {
            LabeledTextField("Weight (kg)", text: $weight, keyboard: .decimalPad)
            LabeledTextField("Body Fat % (optional)", text: $bodyFat, keyboard: .decimalPad)
            LabeledTextField("Notes", text: $notes)
            Button {
                Task { await save() }
            } label: {
                Text(saved ? "Logged ✓" : "Log Measurement")
                    .font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(saved ? Color.green : Color("Accent"))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var weightChart: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Weight Trend")
            Chart(measurements.suffix(12)) { m in
                LineMark(x: .value("Date", m.date), y: .value("kg", m.weight))
                    .foregroundStyle(Color("Accent"))
                PointMark(x: .value("Date", m.date), y: .value("kg", m.weight))
                    .foregroundStyle(Color("Accent"))
            }
            .frame(height: 140)
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var logList: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("History")
            ForEach(measurements.prefix(10)) { m in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(m.date.formatted(date: .abbreviated, time: .omitted))
                            .font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
                        if !m.notes.isEmpty {
                            Text(m.notes).font(.system(size: 11)).foregroundColor(.gray)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(m.weight, specifier: "%.1f") kg")
                            .font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                        if let bf = m.bodyFat {
                            Text("\(bf, specifier: "%.1f")% BF")
                                .font(.system(size: 11)).foregroundColor(.gray)
                        }
                    }
                }
                .padding(12).background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func save() async {
        guard let uid = appState.currentUser?.uid,
              let w   = Double(weight) else { return }
        let m = Measurement(id: UUID().uuidString, date: .now, weight: w,
                            bodyFat: Double(bodyFat), notes: notes)
        try? await FirestoreService.shared.saveMeasurement(m, uid: uid)
        measurements.insert(m, at: 0)
        weight = ""; bodyFat = ""; notes = ""
        saved = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saved = false }
    }

    private func load() async {
        guard let uid = appState.currentUser?.uid else { return }
        measurements = (try? await FirestoreService.shared.fetchMeasurements(uid: uid)) ?? []
    }
}
