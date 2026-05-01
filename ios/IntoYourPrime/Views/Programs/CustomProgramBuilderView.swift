import SwiftUI

struct CustomProgramBuilderView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var themeManager: ThemeManager
    @Environment(\.dismiss) private var dismiss

    // Program metadata
    @State private var name         = ""
    @State private var description  = ""
    @State private var level        = "Beginner"

    // Exercise lists (stored as ExerciseInfo.id strings)
    @State private var warmupIDs:   [String] = []
    @State private var mainIDs:     [String] = []

    // Settings
    @State private var targetReps     = 10
    @State private var targetHoldSecs = 30

    // UI state
    @State private var activeSection: Section = .main
    @State private var showPicker    = false
    @State private var isSaving      = false

    enum Section { case warmup, main }

    private let levels = ["Beginner", "Intermediate", "Advanced"]

    private var canSave: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && !mainIDs.isEmpty }
    private var totalCount: Int { warmupIDs.count + mainIDs.count }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    metadataCard
                    if totalCount > 0 { orderCard }
                    pickerCard
                }
                .padding()
            }
            .background(Color("Background"))
            .navigationTitle("Build Program")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(.gray)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save →") { Task { await save() } }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(canSave ? themeManager.accent : .gray)
                        .disabled(!canSave || isSaving)
                }
            }
        }
    }

    // MARK: - Metadata card

    private var metadataCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionLabel("Program Info")

            LabeledTextField("Name", text: $name)
            LabeledTextField("Description (optional)", text: $description)

            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    sectionLabel("Level")
                    Picker("", selection: $level) {
                        ForEach(levels, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.menu)
                    .tint(themeManager.accent)
                    .padding(10).background(Color("Background"))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                VStack(alignment: .leading, spacing: 6) {
                    sectionLabel("Target Reps")
                    Stepper("\(targetReps)", value: $targetReps, in: 1...50)
                        .font(.system(size: 14)).foregroundColor(.white)
                        .padding(10).background(Color("Background"))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                sectionLabel("Hold Duration (secs — for isometric exercises)")
                Stepper("\(targetHoldSecs)s", value: $targetHoldSecs, in: 5...120, step: 5)
                    .font(.system(size: 14)).foregroundColor(.white)
                    .padding(10).background(Color("Background"))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Order card (drag-to-reorder)

    private var orderCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionLabel("Exercise Order (\(totalCount))")
                Spacer()
                EditButton()
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(themeManager.accent)
            }

            if !warmupIDs.isEmpty {
                Text("WARMUP")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(hex: "#f59e0b"))
                    .tracking(1)

                List {
                    ForEach(warmupIDs, id: \.self) { id in
                        exerciseRow(id: id, section: .warmup)
                    }
                    .onMove  { warmupIDs.move(fromOffsets: $0, toOffset: $1) }
                    .onDelete { warmupIDs.remove(atOffsets: $0) }
                }
                .listStyle(.plain)
                .frame(height: CGFloat(warmupIDs.count) * 56)
                .scrollDisabled(true)
            }

            if !mainIDs.isEmpty {
                Text("MAIN")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(themeManager.accent)
                    .tracking(1)

                List {
                    ForEach(mainIDs, id: \.self) { id in
                        exerciseRow(id: id, section: .main)
                    }
                    .onMove  { mainIDs.move(fromOffsets: $0, toOffset: $1) }
                    .onDelete { mainIDs.remove(atOffsets: $0) }
                }
                .listStyle(.plain)
                .frame(height: CGFloat(mainIDs.count) * 56)
                .scrollDisabled(true)
            }
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func exerciseRow(id: String, section: Section) -> some View {
        let info = EXERCISE_LIBRARY.first { $0.id == id }
        let color: Color = section == .warmup ? Color(hex: "#f59e0b") : themeManager.accent
        return HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 4)
                .fill(color.opacity(0.2))
                .frame(width: 4, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(info?.name ?? id)
                    .font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
                Text(info?.muscles.prefix(3).joined(separator: " · ") ?? "")
                    .font(.system(size: 10)).foregroundColor(.gray)
            }
            Spacer()
            Image(systemName: "line.3.horizontal")
                .foregroundColor(.gray).font(.system(size: 14))
        }
        .padding(.vertical, 6)
        .listRowBackground(Color("Background"))
        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
    }

    // MARK: - Picker card

    private var pickerCard: some View {
        ExercisePickerCard(
            warmupIDs: $warmupIDs,
            mainIDs:   $mainIDs,
            activeSection: $activeSection,
            accent: themeManager.accent
        )
    }

    // MARK: - Save

    private func save() async {
        guard canSave, let uid = appState.currentUser?.uid else { return }
        isSaving = true
        let program = CustomProgram(
            id:             "custom-\(Date().timeIntervalSince1970)",
            name:           name.trimmingCharacters(in: .whitespaces),
            description:    description.isEmpty
                            ? "Custom \(level.lowercased()) program"
                            : description,
            level:          level,
            warmup:         warmupIDs,
            exercises:      mainIDs,
            targetReps:     targetReps,
            targetHoldSecs: targetHoldSecs,
            createdAt:      .now
        )
        try? await FirestoreService.shared.saveCustomProgram(program, uid: uid)
        isSaving = false
        dismiss()
    }
}

// MARK: - Exercise picker sub-view

private struct ExercisePickerCard: View {
    @Binding var warmupIDs:    [String]
    @Binding var mainIDs:      [String]
    @Binding var activeSection: CustomProgramBuilderView.Section
    let accent: Color

    @State private var search = ""

    private var filtered: [ExerciseInfo] {
        search.isEmpty ? EXERCISE_LIBRARY
            : EXERCISE_LIBRARY.filter {
                $0.name.localizedCaseInsensitiveContains(search) ||
                $0.muscles.joined().localizedCaseInsensitiveContains(search)
            }
    }

    private func isSelected(_ id: String) -> Bool {
        activeSection == .warmup ? warmupIDs.contains(id) : mainIDs.contains(id)
    }

    private func inOtherSection(_ id: String) -> Bool {
        activeSection == .warmup ? mainIDs.contains(id) : warmupIDs.contains(id)
    }

    private func toggle(_ id: String) {
        if activeSection == .warmup {
            if warmupIDs.contains(id) { warmupIDs.removeAll { $0 == id } }
            else { warmupIDs.append(id) }
        } else {
            if mainIDs.contains(id) { mainIDs.removeAll { $0 == id } }
            else { mainIDs.append(id) }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section toggle
            HStack(spacing: 8) {
                sectionToggle(.warmup, label: "Warmup \(warmupIDs.isEmpty ? "" : "(\(warmupIDs.count))")",
                              color: Color(hex: "#f59e0b"))
                sectionToggle(.main,   label: "Main \(mainIDs.isEmpty ? "" : "(\(mainIDs.count))")",
                              color: accent)
            }

            Text(activeSection == .warmup
                 ? "Light mobility or warm-up exercises done before the main set."
                 : "Your primary workout exercises.")
                .font(.system(size: 11)).foregroundColor(.gray)

            // Search
            HStack {
                Image(systemName: "magnifyingglass").foregroundColor(.gray)
                TextField("Search exercises or muscles…", text: $search)
                    .foregroundColor(.white).font(.system(size: 13))
                    .autocapitalization(.none)
                if !search.isEmpty {
                    Button { search = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundColor(.gray)
                    }
                }
            }
            .padding(10).background(Color("Background")).clipShape(RoundedRectangle(cornerRadius: 10))

            // Exercise grid
            VStack(spacing: 8) {
                ForEach(filtered) { ex in
                    ExerciseToggleRow(
                        exercise:      ex,
                        selected:      isSelected(ex.id),
                        inOther:       inOtherSection(ex.id),
                        section:       activeSection,
                        sectionAccent: activeSection == .warmup ? Color(hex: "#f59e0b") : accent
                    ) { toggle(ex.id) }
                }
            }
        }
        .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func sectionToggle(_ s: CustomProgramBuilderView.Section, label: String, color: Color) -> some View {
        Button { activeSection = s } label: {
            Text(label)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(activeSection == s ? color : .gray)
                .frame(maxWidth: .infinity).padding(.vertical, 10)
                .background(
                    activeSection == s
                        ? color.opacity(0.15)
                        : Color("Background")
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(activeSection == s ? color.opacity(0.4) : Color.clear, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}

private struct ExerciseToggleRow: View {
    let exercise:      ExerciseInfo
    let selected:      Bool
    let inOther:       Bool
    let section:       CustomProgramBuilderView.Section
    let sectionAccent: Color
    let onTap:         () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                // Checkbox
                ZStack {
                    RoundedRectangle(cornerRadius: 5)
                        .fill(selected ? sectionAccent : Color("Background"))
                        .frame(width: 22, height: 22)
                    if selected {
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(.white)
                    } else {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.gray)
                    }
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.name)
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
                    Text(exercise.muscles.prefix(3).joined(separator: " · "))
                        .font(.system(size: 10)).foregroundColor(.gray)
                }

                Spacer()

                if inOther {
                    Text(section == .warmup ? "in main" : "in warmup")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(section == .warmup ? sectionAccent : Color(hex: "#f59e0b"))
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background((section == .warmup ? sectionAccent : Color(hex: "#f59e0b")).opacity(0.12))
                        .clipShape(Capsule())
                }

                // Difficulty badge
                Text(exercise.difficulty)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(difficultyColor(exercise.difficulty))
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background(difficultyColor(exercise.difficulty).opacity(0.1))
                    .clipShape(Capsule())
            }
            .padding(10)
            .background(selected ? sectionAccent.opacity(0.08) : Color("Background"))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(selected ? sectionAccent.opacity(0.35) : Color.clear, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private func difficultyColor(_ d: String) -> Color {
        d == "Beginner" ? .green : d == "Intermediate" ? .yellow : .red
    }
}
