import SwiftUI

struct ProgramsView: View {
    @EnvironmentObject private var appState:   AppState
    @EnvironmentObject private var themeManager: ThemeManager
    @State private var customPrograms: [CustomProgram] = []
    @State private var showBuilder    = false
    @State private var showGenerator  = false
    @State private var isLoading      = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Action buttons
                    HStack(spacing: 12) {
                        actionButton(
                            icon: "hammer.fill",
                            title: "Build Custom",
                            subtitle: "Pick exercises, set order"
                        ) { showBuilder = true }

                        actionButton(
                            icon: "sparkles",
                            title: "AI Generate",
                            subtitle: "Tell your goals"
                        ) { showGenerator = true }
                    }

                    NavigationLink(destination: ExerciseLibraryView()) {
                        HStack {
                            Label("Browse Exercise Library", systemImage: "books.vertical")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.white)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundColor(.gray)
                        }
                        .padding()
                        .background(Color("Surface"))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    // Saved custom programs
                    if isLoading {
                        SwiftUI.ProgressView().tint(themeManager.accent).padding()
                    } else if !customPrograms.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            sectionLabel("Your Programs (\(customPrograms.count))")
                            ForEach(customPrograms) { prog in
                                CustomProgramRow(program: prog) {
                                    Task { await delete(prog) }
                                }
                            }
                        }
                    } else {
                        Text("No programs yet. Build one or generate with AI!")
                            .font(.system(size: 13)).foregroundColor(.gray)
                            .multilineTextAlignment(.center)
                            .padding()
                            .frame(maxWidth: .infinity)
                            .background(Color("Surface"))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
                .padding()
            }
            .background(Color("Background"))
            .navigationTitle("Programs")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showBuilder, onDismiss: { Task { await load() } }) {
                CustomProgramBuilderView()
                    .environmentObject(appState)
                    .environmentObject(themeManager)
            }
            .sheet(isPresented: $showGenerator) {
                AIWorkoutGeneratorView()
                    .environmentObject(appState)
            }
        }
        .task { await load() }
    }

    private func actionButton(icon: String, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 22))
                    .foregroundColor(themeManager.accent)
                Text(title)
                    .font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                Text(subtitle)
                    .font(.system(size: 11)).foregroundColor(.gray)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color("Surface"))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    private func load() async {
        guard let uid = appState.currentUser?.uid else { isLoading = false; return }
        customPrograms = (try? await FirestoreService.shared.fetchCustomPrograms(uid: uid)) ?? []
        isLoading = false
    }

    private func delete(_ program: CustomProgram) async {
        guard let uid = appState.currentUser?.uid else { return }
        try? await FirestoreService.shared.deleteCustomProgram(id: program.id, uid: uid)
        customPrograms.removeAll { $0.id == program.id }
    }
}

// MARK: - Custom program row

struct CustomProgramRow: View {
    let program:  CustomProgram
    let onDelete: () -> Void
    @EnvironmentObject private var themeManager: ThemeManager

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(program.name)
                        .font(.system(size: 15, weight: .bold)).foregroundColor(.white)
                    Text(program.level)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(levelColor)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(levelColor.opacity(0.12)).clipShape(Capsule())
                }

                if !program.description.isEmpty {
                    Text(program.description).font(.system(size: 12)).foregroundColor(.gray)
                }

                HStack(spacing: 10) {
                    Label("\(program.exercises.count) exercises", systemImage: "figure.run")
                    if !program.warmup.isEmpty {
                        Label("\(program.warmup.count) warmup", systemImage: "flame")
                    }
                    Label(program.estimatedDuration, systemImage: "clock")
                }
                .font(.system(size: 11)).foregroundColor(.gray)
            }

            Spacer()

            Button(action: onDelete) {
                Image(systemName: "trash")
                    .font(.system(size: 14))
                    .foregroundColor(.red.opacity(0.7))
            }
        }
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var levelColor: Color {
        switch program.level {
        case "Beginner":     return .green
        case "Intermediate": return .yellow
        default:             return .red
        }
    }
}

// MARK: - AI workout generator (kept from previous pass)

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
                    if let prog = program { programDetail(prog) }
                    else { generatorForm }
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
                sectionLabel("Your Goals")
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
                    if loading { SwiftUI.ProgressView().tint(.white) }
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
                    Text("Day \(day.dayNumber)")
                        .font(.system(size: 14, weight: .bold)).foregroundColor(Color("Accent"))
                    ForEach(day.exercises) { ex in
                        HStack {
                            Text(ex.name).font(.system(size: 13)).foregroundColor(.white)
                            Spacer()
                            Text("\(ex.sets)×\(ex.reps)")
                                .font(.system(size: 12, weight: .bold)).foregroundColor(.gray)
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
            program = try await AIService.shared.generateWorkout(
                goals: goals, daysPerWeek: days, userProfile: profile
            )
        } catch AIError.notSubscribed {
            error = "Pro subscription required to generate AI programs."
        } catch {
            self.error = "Generation failed. Try again."
        }
    }
}
