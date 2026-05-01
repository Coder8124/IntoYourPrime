import SwiftUI
import Charts

struct SessionSummaryView: View {
    let data: SessionSummaryData
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var showCooldown = false

    private func fmtDuration(_ s: TimeInterval) -> String {
        let m = Int(s) / 60; let sec = Int(s) % 60
        return "\(m)m \(String(sec).leftPad(2, "0"))s"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    gradeHeader
                    statsRow
                    if !data.riskHistory.isEmpty { riskChart }
                    if let a = data.analysis { analysisSection(a) }
                    if !data.earnedBadges.isEmpty { badgesSection }
                    cooldownButton
                }
                .padding()
            }
            .background(Color("Background"))
            .navigationTitle("Session Complete")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        // Increment session count in UserDefaults
                        let count = UserDefaults.standard.integer(forKey: "totalSessions")
                        UserDefaults.standard.set(count + 1, forKey: "totalSessions")
                        // Persist new badges
                        var earned = (UserDefaults.standard.array(forKey: "earnedBadges") as? [String]) ?? []
                        for badge in data.earnedBadges where !earned.contains(badge.id) {
                            earned.append(badge.id)
                        }
                        UserDefaults.standard.set(earned, forKey: "earnedBadges")
                        dismiss()
                    }
                }
            }
        }
        .sheet(isPresented: $showCooldown) {
            CooldownView(exercises: data.cooldownExs)
        }
    }

    // MARK: - Grade header

    private var gradeHeader: some View {
        let g = data.grade
        return VStack(spacing: 10) {
            Text(g.grade)
                .font(.system(size: 72, weight: .black, design: .rounded))
                .foregroundStyle(Color(hex: g.color))
            Text(g.label)
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)
            Text(data.session.exercise.capitalized + " · " + fmtDuration(data.session.duration))
                .font(.system(size: 13))
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(Color(hex: g.color).opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color(hex: g.color).opacity(0.2), lineWidth: 1))
    }

    // MARK: - Stats

    private var statsRow: some View {
        HStack(spacing: 12) {
            StatCard(label: "Score",  value: "\(data.score)")
            StatCard(label: "Reps",   value: "\(data.session.repCount)")
            StatCard(label: "Avg Risk", value: "\(Int(data.session.avgRiskScore))")
        }
    }

    // MARK: - Risk chart

    private var riskChart: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Risk Over Time")
            let points = data.riskHistory.enumerated().map { (i, v) in (i, v) }
            Chart(points, id: \.0) { pt in
                LineMark(x: .value("Rep", pt.0), y: .value("Risk", pt.1))
                    .foregroundStyle(Color("Accent"))
                AreaMark(x: .value("Rep", pt.0), y: .value("Risk", pt.1))
                    .foregroundStyle(Color("Accent").opacity(0.1))
            }
            .chartYScale(domain: 0...100)
            .frame(height: 120)
        }
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Analysis

    private func analysisSection(_ a: FormAnalysisResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Coach Feedback")
            ForEach(a.suggestions, id: \.self) { s in
                HStack(alignment: .top, spacing: 8) {
                    Text("→").foregroundColor(Color("Accent")).font(.system(size: 13, weight: .bold))
                    Text(s).font(.system(size: 13)).foregroundColor(.white.opacity(0.9))
                }
            }
            if !a.safetyConcerns.isEmpty {
                Divider().opacity(0.2)
                ForEach(a.safetyConcerns, id: \.self) { c in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "exclamationmark.shield.fill").foregroundColor(.red)
                        Text(c).font(.system(size: 12)).foregroundColor(.red.opacity(0.85))
                    }
                }
            }
        }
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Badges

    private var badgesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Badges Earned")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(data.earnedBadges) { badge in
                    VStack(spacing: 6) {
                        Text(badge.icon).font(.system(size: 28))
                        Text(badge.name)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(10)
                    .background(Color("Accent").opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Cooldown

    private var cooldownButton: some View {
        Group {
            if !data.cooldownExs.isEmpty {
                Button {
                    showCooldown = true
                } label: {
                    Label("Start Cooldown (\(data.cooldownExs.count) exercises)",
                          systemImage: "figure.cooldown")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.blue)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
        }
    }
}

// MARK: - Color from hex

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8)  & 0xFF) / 255
        let b = Double(int         & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

extension String {
    func leftPad(_ length: Int, _ char: Character) -> String {
        String(repeating: char, count: max(0, length - count)) + self
    }
}
