import SwiftUI
import PhotosUI
import AVFoundation
import CoreImage

struct ClipCoachCard: View {
    @State private var selectedItem: PhotosPickerItem?
    @State private var exercise  = ""
    @State private var state: CardState = .idle
    @State private var result: FormAnalysisResult?
    @State private var errorMsg = ""

    enum CardState { case idle, picking, extracting, analyzing, results, error }

    private let exercises = ["push-up","squat","deadlift","bench press",
                             "shoulder press","pull-up","lunge","plank","other"]

    var body: some View {
        VStack(spacing: 0) {
            switch state {
            case .idle:    idleButton
            case .picking: pickingForm
            case .extracting, .analyzing: progressCard
            case .results:  if let r = result { resultsCard(r) }
            case .error:   errorCard
            }
        }
    }

    private var idleButton: some View {
        Button {
            state = .picking
        } label: {
            Label("Analyze a clip", systemImage: "video.badge.plus")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color("Surface"))
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    private var pickingForm: some View {
        VStack(spacing: 14) {
            HStack {
                Text("Clip Coach")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.gray)
                    .textCase(.uppercase)
                    .tracking(1)
                Spacer()
                Button { state = .idle } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12))
                        .foregroundColor(.gray)
                }
            }

            PhotosPicker(selection: $selectedItem, matching: .videos) {
                Label(selectedItem == nil ? "Choose video" : "Video selected ✓",
                      systemImage: "video")
                    .font(.system(size: 13))
                    .foregroundColor(selectedItem == nil ? .gray : Color("Accent"))
                    .frame(maxWidth: .infinity)
                    .padding(10)
                    .background(Color("Background"))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            Picker("Exercise", selection: $exercise) {
                Text("Select exercise…").tag("")
                ForEach(exercises, id: \.self) { ex in
                    Text(ex.capitalized).tag(ex)
                }
            }
            .pickerStyle(.menu)
            .tint(Color("Accent"))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(Color("Background"))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Button("Analyze →") {
                Task { await analyze() }
            }
            .buttonStyle(ProminentButtonStyle(color: Color("Accent")))
            .disabled(selectedItem == nil || exercise.isEmpty)
            .frame(maxWidth: .infinity)
        }
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var progressCard: some View {
        VStack(spacing: 10) {
            ProgressView()
                .tint(Color("Accent"))
            Text(state == .extracting ? "Extracting frames…" : "Sending to coach…")
                .font(.system(size: 12))
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func resultsCard(_ r: FormAnalysisResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Clip Coach · \(exercise.capitalized)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.gray)
                    .textCase(.uppercase)
                Spacer()
                let c = riskColor(r.riskScore)
                Text("Risk \(r.riskScore)")
                    .font(.system(size: 12, weight: .black))
                    .foregroundColor(c)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(c.opacity(0.12))
                    .clipShape(Capsule())
            }

            ForEach(r.suggestions.prefix(3), id: \.self) { s in
                HStack(alignment: .top, spacing: 6) {
                    Text("→").foregroundColor(Color("Accent"))
                    Text(s).font(.system(size: 12)).foregroundColor(.white.opacity(0.85))
                }
            }

            if !r.safetyConcerns.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Safety").font(.system(size: 10, weight: .bold)).foregroundColor(.red).textCase(.uppercase)
                    ForEach(r.safetyConcerns, id: \.self) { c in
                        Text(c).font(.system(size: 11)).foregroundColor(.red.opacity(0.8))
                    }
                }
                .padding(10)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            Button("Try another clip") { reset() }
                .font(.system(size: 11))
                .foregroundColor(.gray)
        }
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var errorCard: some View {
        VStack(spacing: 10) {
            Text(errorMsg).font(.system(size: 12)).foregroundColor(.red)
            Button("Try again") { state = .picking }
                .font(.system(size: 12))
                .foregroundColor(Color("Accent"))
        }
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Helpers

    private func riskColor(_ score: Int) -> Color {
        score < 30 ? .green : score < 60 ? .yellow : .red
    }

    private func reset() {
        state = .idle; result = nil; selectedItem = nil; exercise = ""
    }

    private func analyze() async {
        guard let item = selectedItem else { return }
        state = .extracting

        guard let movie = try? await item.loadTransferable(type: VideoTransferable.self) else {
            errorMsg = "Could not load video."; state = .error; return
        }

        let frames: [String]
        do {
            frames = try await extractFrames(from: movie.url)
        } catch {
            errorMsg = error.localizedDescription; state = .error; return
        }

        state = .analyzing
        let profile = loadUserProfile()
        do {
            result = try await AIService.shared.analyzeForm(
                frames: frames, exercise: exercise, repCount: 0,
                userProfile: profile, phase: "main"
            )
            state = .results
        } catch {
            errorMsg = "Analysis failed. Check your subscription."; state = .error
        }
    }

    private func loadUserProfile() -> UserProfile {
        let d = UserDefaults.standard
        return UserProfile(
            name:         d.string(forKey: "name")         ?? "",
            age:          d.integer(forKey: "age")         == 0 ? 25 : d.integer(forKey: "age"),
            weight:       d.double(forKey: "weight")       == 0 ? 70 : d.double(forKey: "weight"),
            fitnessLevel: d.string(forKey: "fitnessLevel") ?? "intermediate",
            email:        ""
        )
    }
}

// MARK: - Frame extraction from video URL

private func extractFrames(from url: URL) async throws -> [String] {
    let asset     = AVAsset(url: url)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: 256, height: 256)

    let duration  = try await asset.load(.duration)
    let seconds   = CMTimeGetSeconds(duration)
    guard seconds > 0 else { throw NSError(domain: "clip", code: 0, userInfo: [NSLocalizedDescriptionKey: "Video too short"]) }

    let ratios: [Double] = [0.05, 0.18, 0.31, 0.44, 0.57, 0.70, 0.83, 0.95]
    let times  = ratios.map { CMTime(seconds: $0 * seconds, preferredTimescale: 600) }

    var frames: [String] = []
    for time in times {
        if let cgImage = try? generator.copyCGImage(at: time, actualTime: nil) {
            let uiImage = UIImage(cgImage: cgImage)
            if let data = uiImage.jpegData(compressionQuality: 0.7) {
                frames.append("data:image/jpeg;base64," + data.base64EncodedString())
            }
        }
    }
    return frames
}

// MARK: - Transferable wrapper for video

struct VideoTransferable: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { video in
            SentTransferredFile(video.url)
        } importing: { received in
            let dest = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mov")
            try FileManager.default.copyItem(at: received.file, to: dest)
            return Self(url: dest)
        }
    }
}
