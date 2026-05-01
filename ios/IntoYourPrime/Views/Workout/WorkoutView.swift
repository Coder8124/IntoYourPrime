import SwiftUI
import AVFoundation

struct WorkoutView: View {
    @StateObject private var camera    = CameraService()
    @StateObject private var pose      = PoseDetectionService()
    @State private var exercise        = "squat"
    @State private var phase: String   = "warmup"
    @State private var repCount        = 0
    @State private var analysis: FormAnalysisResult?
    @State private var isAnalyzing     = false
    @State private var frameBuffer:    [CMSampleBuffer] = []
    @State private var showExPicker    = false
    @State private var showCooldown    = false
    @State private var cooldownExs:    [CooldownExercise] = []
    @State private var errorMessage:   String?
    @EnvironmentObject private var appState: AppState

    private let exercises = ["squat", "push-up", "deadlift", "pull-up",
                             "lunge", "plank", "bench press", "shoulder press"]
    private var userProfile: UserProfile {
        // Load from UserDefaults/Firestore; fallback to defaults
        let d = UserDefaults.standard
        return UserProfile(
            name:         d.string(forKey: "name")         ?? "",
            age:          d.integer(forKey: "age")         == 0 ? 25 : d.integer(forKey: "age"),
            weight:       d.double(forKey: "weight")       == 0 ? 70 : d.double(forKey: "weight"),
            fitnessLevel: d.string(forKey: "fitnessLevel") ?? "intermediate",
            email:        appState.currentUser?.email      ?? ""
        )
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Camera feed
            CameraPreviewView(session: camera.session)
                .ignoresSafeArea()

            // Pose skeleton overlay
            PoseOverlayView(pose: pose.currentPose, riskScore: pose.riskScore)
                .ignoresSafeArea()

            // HUD
            VStack(spacing: 0) {
                topBar
                Spacer()
                if let a = analysis { analysisCard(a) }
                bottomControls
            }
        }
        .task {
            await camera.requestPermission()
            camera.start(position: .front)
            camera.frameHandler = { [weak pose] buf in
                pose?.process(sampleBuffer: buf, exercise: exercise)
                // Collect frames for periodic AI analysis
            }
            pose.onRepCounted = { count in
                repCount = count
                if count % 5 == 0 { Task { await sendAnalysis() } }
            }
        }
        .onDisappear { camera.stop() }
        .sheet(isPresented: $showCooldown) {
            CooldownView(exercises: cooldownExs)
        }
    }

    // MARK: - Subviews

    private var topBar: some View {
        HStack {
            // Exercise picker button
            Button {
                showExPicker = true
            } label: {
                HStack(spacing: 6) {
                    Text(exercise.capitalized)
                        .font(.system(size: 15, weight: .bold))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .bold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
            }
            .confirmationDialog("Choose Exercise", isPresented: $showExPicker, titleVisibility: .visible) {
                ForEach(exercises, id: \.self) { ex in
                    Button(ex.capitalized) {
                        exercise = ex
                        pose.resetReps()
                        repCount = 0
                    }
                }
            }

            Spacer()

            // Camera flip button
            Button {
                camera.toggleCamera()
            } label: {
                Image(systemName: "arrow.triangle.2.circlepath.camera.fill")
                    .font(.system(size: 20))
                    .foregroundColor(.white)
                    .padding(10)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())
            }
        }
        .padding()
    }

    private var bottomControls: some View {
        VStack(spacing: 12) {
            // Rep counter
            HStack(spacing: 24) {
                VStack(spacing: 2) {
                    Text("\(repCount)")
                        .font(.system(size: 48, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                    Text("reps")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.gray)
                }

                // Phase toggle
                VStack(spacing: 6) {
                    Button(phase == "warmup" ? "Warmup" : "Main") {
                        phase = phase == "warmup" ? "main" : "warmup"
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(phase == "warmup" ? Color.blue.opacity(0.7) : Color("Accent").opacity(0.7))
                    .clipShape(Capsule())
                }
            }

            // Finish button
            HStack(spacing: 12) {
                Button("Analyze Now") {
                    Task { await sendAnalysis() }
                }
                .buttonStyle(ProminentButtonStyle(color: .blue))
                .disabled(isAnalyzing)

                Button("Finish") {
                    Task { await finishWorkout() }
                }
                .buttonStyle(ProminentButtonStyle(color: Color("Accent")))
            }

            if let err = errorMessage {
                Text(err)
                    .font(.system(size: 11))
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
        .background(.ultraThinMaterial)
    }

    private func analysisCard(_ a: FormAnalysisResult) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let issue = a.dominantIssue, !issue.isEmpty, !issue.hasPrefix("__") {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.yellow)
                    Text(issue)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                }
            }
            ForEach(a.suggestions.prefix(2), id: \.self) { s in
                HStack(alignment: .top, spacing: 6) {
                    Text("→").foregroundColor(Color("Accent"))
                    Text(s).font(.system(size: 12)).foregroundColor(.white.opacity(0.85))
                }
            }
        }
        .padding(12)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
    }

    // MARK: - Actions

    private func sendAnalysis() async {
        guard !isAnalyzing, SubscriptionService.shared.isActive else { return }
        isAnalyzing = true
        defer { isAnalyzing = false }
        do {
            analysis = try await AIService.shared.analyzeForm(
                frames:      [],  // real implementation captures from CameraService
                exercise:    exercise,
                repCount:    repCount,
                userProfile: userProfile,
                phase:       phase
            )
        } catch AIError.limitReached {
            errorMessage = "Monthly AI limit reached. Resets next billing cycle."
        } catch {
            errorMessage = nil
        }
    }

    private func finishWorkout() async {
        camera.stop()
        guard let uid = appState.currentUser?.uid else { return }
        let session = WorkoutSession(
            id:           UUID().uuidString,
            exercise:     exercise,
            date:         .now,
            repCount:     repCount,
            avgRiskScore: Double(pose.riskScore),
            duration:     0
        )
        try? await FirestoreService.shared.saveSes​sion(session, uid: uid)

        if SubscriptionService.shared.isActive {
            if let exs = try? await AIService.shared.generateCooldown(session: session, userProfile: userProfile) {
                cooldownExs = exs
                showCooldown = true
                return
            }
        }
        showCooldown = true
    }
}

struct ProminentButtonStyle: ButtonStyle {
    var color: Color
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(color.opacity(configuration.isPressed ? 0.7 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
