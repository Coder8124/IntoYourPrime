import SwiftUI

struct ProgramsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showGenerator = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Button {
                    showGenerator = true
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Generate AI Program", systemImage: "sparkles")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.white)
                            Text("Tell your goals, get a personalized plan")
                                .font(.system(size: 12))
                                .foregroundColor(.gray)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundColor(.gray)
                    }
                    .padding()
                    .background(Color("Surface"))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .padding()
                Spacer()
            }
            .background(Color("Background"))
            .navigationTitle("Programs")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showGenerator) {
                AIWorkoutGeneratorView()
            }
        }
    }
}

struct AIWorkoutGeneratorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @State private var goals    = ""
    @State private var days     = 3
    @State private var program:  WorkoutProgram?
    @State private var loading  = false
    @State private var error    = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if let prog = program {
                        programDetail(prog)
                    } else {
                        generatorForm
                    }
                }
                .padding()
            }
            .background(Color("Background"))
            .navigationTitle("AI Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var generatorForm: some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Your Goals").font(.system(size: 11, weight: .semibold)).foregroundColor(.gray).textCase(.uppercase).tracking(1)
                TextField("e.g. build muscle, lose fat, improve endurance…", text: $goals, axis: .vertical)
                    .font(.system(size: 14)).foregroundColor(.white)
                    .padding(12).background(Color("Surface"))
                    .clipShape(RoundedRectangle(cornerRadius: 10)).lineLimit(4)
            }

            Stepper("Days per week: \(days)", value: $days, in: 2...6)
                .font(.system(size: 14)).foregroundColor(.white)
                .padding(12).background(Color("Surface"))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            if !error.isEmpty {
                Text(error).font(.system(size: 12)).foregroundColor(.red)
            }

            Button {
                Task { await generate() }
            } label: {
                Group {
                    if loading { ProgressView().tint(.white) }
                    else { Text("Generate Program →").font(.system(size: 14, weight: .bold)).foregroundColor(.white) }
                }
                .frame(maxWidth: .infinity).padding(.vertical, 14)
                .background(Color("Accent")).clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(goals.isEmpty || loading)
        }
    }

    private func programDetail(_ prog: WorkoutProgram) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(prog.name).font(.system(size: 20, weight: .black)).foregroundColor(.white)
            Text(prog.description).font(.system(size: 13)).foregroundColor(.gray)
            ForEach(prog.days) { day in
                VStack(alignment: .leading, spacing: 8) {
                    Text("Day \(day.dayNumber)").font(.system(size: 14, weight: .bold)).foregroundColor(Color("Accent"))
                    ForEach(day.exercises) { ex in
                        HStack {
                            Text(ex.name).font(.system(size: 13)).foregroundColor(.white)
                            Spacer()
                            Text("\(ex.sets)×\(ex.reps)").font(.system(size: 12, weight: .bold)).foregroundColor(.gray)
                        }
                        .padding(10).background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }

    private func generate() async {
        error   = ""
        loading = true
        defer  { loading = false }
        let d = UserDefaults.standard
        let profile = UserProfile(
            name: d.string(forKey: "name") ?? "",
            age:  d.integer(forKey: "age") == 0 ? 25 : d.integer(forKey: "age"),
            weight: d.double(forKey: "weight") == 0 ? 70 : d.double(forKey: "weight"),
            fitnessLevel: d.string(forKey: "fitnessLevel") ?? "intermediate",
            email: appState.currentUser?.email ?? ""
        )
        do {
            program = try await AIService.shared.generateWorkout(goals: goals, daysPerWeek: days, userProfile: profile)
        } catch AIError.notSubscribed {
            error = "Pro subscription required to generate AI programs."
        } catch {
            self.error = "Generation failed. Try again."
        }
    }
}
