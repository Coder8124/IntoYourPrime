import SwiftUI

struct CooldownView: View {
    let exercises: [CooldownExercise]
    @Environment(\.dismiss) private var dismiss
    @State private var currentIndex = 0
    @State private var timeLeft:    Int = 0
    @State private var timer: Timer?

    private var current: CooldownExercise? { exercises.isEmpty ? nil : exercises[min(currentIndex, exercises.count - 1)] }

    var body: some View {
        ZStack {
            Color("Background").ignoresSafeArea()

            VStack(spacing: 24) {
                Text("Cooldown")
                    .font(.system(size: 28, weight: .black))
                    .foregroundColor(.white)
                    .padding(.top, 40)

                if exercises.isEmpty {
                    Text("Great session! No specific cooldown generated.")
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                        .padding()
                } else if let ex = current {
                    VStack(spacing: 16) {
                        // Timer ring
                        ZStack {
                            Circle()
                                .stroke(Color.white.opacity(0.1), lineWidth: 8)
                            Circle()
                                .trim(from: 0, to: CGFloat(timeLeft) / CGFloat(ex.durationSeconds))
                                .stroke(Color("Accent"), style: StrokeStyle(lineWidth: 8, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                                .animation(.linear(duration: 1), value: timeLeft)
                            Text("\(timeLeft)")
                                .font(.system(size: 44, weight: .black, design: .rounded))
                                .foregroundColor(.white)
                        }
                        .frame(width: 160, height: 160)

                        Text(ex.name)
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.white)

                        Text(ex.instruction)
                            .font(.system(size: 14))
                            .foregroundColor(.gray)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)

                        HStack {
                            ForEach(ex.targetMuscles, id: \.self) { m in
                                Text(m)
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundColor(Color("Accent"))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color("Accent").opacity(0.1))
                                    .clipShape(Capsule())
                            }
                        }

                        Text("\(currentIndex + 1) of \(exercises.count)")
                            .font(.system(size: 12))
                            .foregroundColor(.gray)
                    }
                }

                Spacer()

                Button(currentIndex < exercises.count - 1 ? "Next →" : "Done") {
                    if currentIndex < exercises.count - 1 {
                        currentIndex += 1
                        startTimer()
                    } else {
                        dismiss()
                    }
                }
                .buttonStyle(ProminentButtonStyle(color: Color("Accent")))
                .padding(.bottom, 40)
            }
            .padding()
        }
        .onAppear { startTimer() }
        .onDisappear { timer?.invalidate() }
    }

    private func startTimer() {
        timer?.invalidate()
        timeLeft = current?.durationSeconds ?? 30
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if timeLeft > 0 {
                timeLeft -= 1
            } else {
                timer?.invalidate()
            }
        }
    }
}
