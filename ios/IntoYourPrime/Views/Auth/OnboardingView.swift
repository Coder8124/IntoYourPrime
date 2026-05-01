import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var appState: AppState
    @State private var step        = 0
    @State private var name        = ""
    @State private var age         = ""
    @State private var weight      = ""
    @State private var level       = "intermediate"
    @State private var isSaving    = false

    private let levels = ["beginner", "intermediate", "advanced"]

    var body: some View {
        ZStack {
            Color("Background").ignoresSafeArea()

            VStack(spacing: 32) {
                // Progress dots
                HStack(spacing: 8) {
                    ForEach(0..<3) { i in
                        Circle()
                            .fill(i <= step ? Color("Accent") : Color.gray.opacity(0.3))
                            .frame(width: 8, height: 8)
                            .animation(.easeInOut, value: step)
                    }
                }
                .padding(.top, 48)

                Spacer()

                Group {
                    if step == 0 { welcomeStep }
                    else if step == 1 { profileStep }
                    else { readyStep }
                }

                Spacer()

                Button {
                    if step < 2 { withAnimation { step += 1 } }
                    else { Task { await finish() } }
                } label: {
                    Group {
                        if isSaving { SwiftUI.ProgressView().tint(.white) }
                        else { Text(step < 2 ? "Continue →" : "Let's Go 💪")
                            .font(.system(size: 16, weight: .bold)).foregroundColor(.white)
                        }
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(Color("Accent")).clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .disabled(isSaving || (step == 1 && (name.isEmpty || age.isEmpty || weight.isEmpty)))
                .padding(.horizontal, 24).padding(.bottom, 40)
            }
            .padding(.horizontal, 24)
        }
    }

    private var welcomeStep: some View {
        VStack(spacing: 16) {
            Text("💪").font(.system(size: 64))
            Text("Welcome to\nIntoYourPrime")
                .font(.system(size: 28, weight: .black, design: .rounded))
                .foregroundColor(.white).multilineTextAlignment(.center)
            Text("AI-powered workout coaching that watches your form in real time, counts your reps, and keeps you safe.")
                .font(.system(size: 15)).foregroundColor(.gray).multilineTextAlignment(.center)
        }
    }

    private var profileStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Tell us about yourself")
                .font(.system(size: 22, weight: .black)).foregroundColor(.white)

            LabeledTextField("Your Name", text: $name)
            LabeledTextField("Age", text: $age, keyboard: .numberPad)
            LabeledTextField("Weight (kg)", text: $weight, keyboard: .decimalPad)

            VStack(alignment: .leading, spacing: 8) {
                Text("Fitness Level")
                    .font(.system(size: 11, weight: .semibold)).foregroundColor(.gray)
                    .textCase(.uppercase).tracking(1)
                Picker("", selection: $level) {
                    ForEach(levels, id: \.self) { Text($0.capitalized).tag($0) }
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private var readyStep: some View {
        VStack(spacing: 16) {
            Text("🎯").font(.system(size: 64))
            Text("You're all set!")
                .font(.system(size: 28, weight: .black)).foregroundColor(.white)
            VStack(alignment: .leading, spacing: 12) {
                featureBullet(icon: "figure.run", text: "Live pose analysis & rep counting")
                featureBullet(icon: "waveform.path.ecg", text: "Real-time injury risk scoring")
                featureBullet(icon: "sparkles", text: "AI form coaching after every set")
                featureBullet(icon: "video.badge.plus", text: "Clip Coach — upload & review")
            }
            .padding()
            .background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    private func featureBullet(icon: String, text: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundColor(Color("Accent")).frame(width: 24)
            Text(text).font(.system(size: 14)).foregroundColor(.white)
        }
    }

    private func finish() async {
        guard let uid = appState.currentUser?.uid else { return }
        isSaving = true
        let profile = UserProfile(
            name: name, age: Int(age) ?? 25,
            weight: Double(weight) ?? 70, fitnessLevel: level,
            email: appState.currentUser?.email ?? ""
        )
        UserDefaults.standard.set(name,   forKey: "name")
        UserDefaults.standard.set(Int(age) ?? 25,    forKey: "age")
        UserDefaults.standard.set(Double(weight) ?? 70, forKey: "weight")
        UserDefaults.standard.set(level,  forKey: "fitnessLevel")
        try? await FirestoreService.shared.saveProfile(profile, uid: uid)
        OnboardingState.markComplete()
        isSaving = false
    }
}
