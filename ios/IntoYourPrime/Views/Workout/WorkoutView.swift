import SwiftUI
import AVFoundation

struct WorkoutView: View {
    @StateObject private var camera  = CameraService()
    @StateObject private var pose    = PoseDetectionService()
    @State private var exercise      = "squat"
    @State private var phase         = "warmup"
    @State private var repCount      = 0
    @State private var analysis: FormAnalysisResult?
    @State private var isAnalyzing   = false
    @State private var showExPicker  = false
    @State private var showCooldown  = false
    @State private var cooldownExs:  [CooldownExercise] = []
    @State private var sessionStart  = Date()
    @State private var riskHistory:  [Int] = []
    @State private var summaryData:  SessionSummaryData?
    @State private var showSummary   = false
    @State private var errorMessage: String?
    @EnvironmentObject private var appState: AppState

    private let exercises = ["squat", "push-up", "deadlift", "pull-up",
                             "lunge", "plank", "bench press", "shoulder press"]

    private var profile: UserProfile {
        let d = UserDefaults.standard
        return UserProfile(
            name:         d.string(forKey: "name")         ?? "",
            age:          d.integer(forKey: "age").clamped(to: 10...100, fallback: 25),
            weight:       d.double(forKey: "weight")       == 0 ? 70 : d.double(forKey: "weight"),
            fitnessLevel: d.string(forKey: "fitnessLevel") ?? "intermediate",
            email:        appState.currentUser?.email ?? ""
        )
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            CameraPreviewView(session: camera.session).ignoresSafeArea()
            PoseOverlayView(pose: pose.currentPose, riskScore: pose.riskScore).ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                Spacer()
                if let a = analysis { analysisCard(a) }
                bottomControls
            }
        }
        .task {
            sessionStart = .now
            await camera.requestPermission()
            camera.start(position: .front)
            camera.frameHandler = { buf in
                pose.process(sampleBuffer: buf, exercise: exercise)
                camera.appendFrame(from: buf)
            }
            pose.onRepCounted = { count in
                repCount = count
                riskHistory.append(pose.riskScore)
                if count % 5 == 0 { Task { await sendAnalysis() } }
            }
        }
        .onDisappear { camera.stop() }
        .sheet(isPresented: $showCooldown) { CooldownView(exercises: cooldownExs) }
        .fullScreenCover(item: $summaryData) { data in
            SessionSummaryView(data: data)
                .environmentObject(appState)
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack {
            Button { showExPicker = true } label: {
                HStack(spacing: 6) {
                    Text(exercise.capitalized).font(.system(size: 15, weight: .bold))
                    Image(systemName: "chevron.down").font(.system(size: 11, weight: .bold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(.ultraThinMaterial).clipShape(Capsule())
            }
            .confirmationDialog("Choose Exercise", isPresented: $showExPicker, titleVisibility: .visible) {
                ForEach(exercises, id: \.self) { ex in
                    Button(ex.capitalized) {
                        exercise = ex; pose.resetReps(); repCount = 0
                    }
                }
            }

            Spacer()

            Button { camera.toggleCamera() } label: {
                Image(systemName: "arrow.triangle.2.circlepath.camera.fill")
                    .font(.system(size: 20)).foregroundColor(.white)
                    .padding(10).background(.ultraThinMaterial).clipShape(Circle())
            }
        }
        .padding()
    }

    // MARK: - Bottom controls

    private var bottomControls: some View {
        VStack(spacing: 12) {
            HStack(spacing: 24) {
                VStack(spacing: 2) {
                    Text("\(repCount)")
                        .font(.system(size: 48, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                    Text("reps").font(.system(size: 11, weight: .semibold)).foregroundColor(.gray)
                }

                VStack(spacing: 4) {
                    Text("Risk").font(.system(size: 10, weight: .semibold)).foregroundColor(.gray)
                    Text("\(pose.riskScore)")
                        .font(.system(size: 24, weight: .black, design: .rounded))
                        .foregroundColor(riskColor(pose.riskScore))
                }

                Button(phase == "warmup" ? "→ Main" : "Warmup") {
                    phase = phase == "warmup" ? "main" : "warmup"
                }
                .font(.system(size: 12, weight: .bold)).foregroundColor(.white)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(phase == "warmup" ? Color.blue.opacity(0.8) : Color("Accent").opacity(0.8))
                .clipShape(Capsule())
            }

            HStack(spacing: 12) {
                Button("Analyze") { Task { await sendAnalysis() } }
                    .buttonStyle(ProminentButtonStyle(color: .blue))
                    .disabled(isAnalyzing || !SubscriptionService.shared.isActive)

                Button("Finish") { Task { await finishWorkout() } }
                    .buttonStyle(ProminentButtonStyle(color: Color("Accent")))
            }

            if let err = errorMessage {
                Text(err).font(.system(size: 11)).foregroundColor(.red).multilineTextAlignment(.center)
            }
        }
        .padding().background(.ultraThinMaterial)
    }

    private func analysisCard(_ a: FormAnalysisResult) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let issue = a.dominantIssue, !issue.isEmpty, !issue.hasPrefix("__") {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundColor(.yellow)
                    Text(issue).font(.system(size: 12, weight: .semibold)).foregroundColor(.white)
                }
            }
            ForEach(a.suggestions.prefix(2), id: \.self) { s in
                HStack(alignment: .top, spacing: 6) {
                    Text("→").foregroundColor(Color("Accent"))
                    Text(s).font(.system(size: 12)).foregroundColor(.white.opacity(0.85))
                }
            }
            ForEach(a.safetyConcerns.prefix(1), id: \.self) { c in
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: "exclamationmark.shield.fill").foregroundColor(.red)
                    Text(c).font(.system(size: 11)).foregroundColor(.red.opacity(0.9))
                }
            }
        }
        .padding(12).background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 14)).padding(.horizontal)
    }

    // MARK: - Actions

    private func sendAnalysis() async {
        guard !isAnalyzing, SubscriptionService.shared.isActive, !camera.capturedFrames.isEmpty else { return }
        isAnalyzing = true
        defer { isAnalyzing = false }
        do {
            analysis = try await AIService.shared.analyzeForm(
                frames: camera.capturedFrames, exercise: exercise,
                repCount: repCount, userProfile: profile, phase: phase
            )
            camera.clearCapturedFrames()
            errorMessage = nil
        } catch AIError.limitReached {
            errorMessage = "Monthly AI limit reached."
        } catch { errorMessage = nil }
    }

    private func finishWorkout() async {
        camera.stop()
        let duration = Date().timeIntervalSince(sessionStart)
        let avgRisk  = riskHistory.isEmpty ? 0 : riskHistory.reduce(0, +) / riskHistory.count

        let session = WorkoutSession(
            id: UUID().uuidString, exercise: exercise,
            date: .now, repCount: repCount,
            avgRiskScore: Double(avgRisk), duration: duration
        )

        // Save to Firestore
        if let uid = appState.currentUser?.uid {
            try? await FirestoreService.shared.saveSession(session, uid: uid)
        }

        // Compute workout score (web parity)
        let score = computeWorkoutScore(
            avgRisk: Double(avgRisk), totalReps: repCount,
            cooldownCompleted: false, warmupScore: 70,
            durationMinutes: duration / 60
        )

        // Generate cooldown if subscribed
        if SubscriptionService.shared.isActive {
            cooldownExs = (try? await AIService.shared.generateCooldown(session: session, userProfile: profile)) ?? []
        }

        summaryData = SessionSummaryData(
            session: session, score: score,
            analysis: analysis, cooldownExs: cooldownExs,
            riskHistory: riskHistory
        )
    }
}

// MARK: - Helpers

private func riskColor(_ score: Int) -> Color {
    score < 30 ? .green : score < 60 ? .yellow : .red
}

func computeWorkoutScore(avgRisk: Double, totalReps: Int, cooldownCompleted: Bool,
                          warmupScore: Double, durationMinutes: Double) -> Int {
    let form     = (1 - min(avgRisk, 100) / 100) * 40
    let reps     = min(Double(totalReps) / 30.0, 1) * 20
    let cooldown = cooldownCompleted ? 15.0 : 0
    let warmup   = (min(warmupScore, 100) / 100) * 15
    let duration = min(durationMinutes / 30.0, 1) * 10
    return Int(form + reps + cooldown + warmup + duration)
}

func scoreGrade(_ score: Int) -> (grade: String, color: Color, label: String) {
    if score >= 95 { return ("S", Color.purple, "Perfect")   }
    if score >= 85 { return ("A", Color.green,  "Excellent") }
    if score >= 70 { return ("B", Color.blue,   "Great")     }
    if score >= 55 { return ("C", Color.yellow, "Good")      }
    if score >= 40 { return ("D", Color.orange, "Fair")      }
    return              ("F", Color.red,    "Needs Work")
}

extension UIImage {
    func resized(to size: CGSize) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { _ in self.draw(in: CGRect(origin: .zero, size: size)) }
    }
}

extension Int {
    func clamped(to range: ClosedRange<Int>, fallback: Int) -> Int {
        self == 0 ? fallback : Swift.max(range.lowerBound, Swift.min(range.upperBound, self))
    }
}
