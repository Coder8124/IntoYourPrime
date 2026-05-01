import SwiftUI

struct ExerciseInfo: Identifiable {
    let id:          String
    let name:        String
    let muscles:     [String]
    let difficulty:  String
    let description: String
    let cues:        [String]
    let riskNote:    String
}

let EXERCISE_LIBRARY: [ExerciseInfo] = [
    ExerciseInfo(id: "squat", name: "Squat", muscles: ["Quads","Glutes","Hamstrings","Core"],
        difficulty: "Beginner",
        description: "The foundational lower-body movement. Builds strength through the full leg chain and improves hip mobility.",
        cues: ["Feet shoulder-width apart, toes slightly out","Keep chest tall throughout","Drive knees out — track over your middle toe","Descend until thighs are parallel","Drive through your whole foot on the way up"],
        riskNote: "Main risk: knee valgus (knees caving inward). Tracked live."),
    ExerciseInfo(id: "pushup", name: "Push-Up", muscles: ["Chest","Triceps","Shoulders","Core"],
        difficulty: "Beginner",
        description: "A compound upper-body push movement. Trains chest, shoulders, and triceps while demanding core stability.",
        cues: ["Hands slightly wider than shoulder-width","Body forms a straight line from head to heel","Lower until chest almost touches the floor","Elbows at ~45° from torso — not flared wide","Squeeze glutes and core throughout"],
        riskNote: "Main risks: hip sag (weak core) and elbow flare (shoulder strain)."),
    ExerciseInfo(id: "deadlift", name: "Deadlift", muscles: ["Hamstrings","Glutes","Lower Back","Traps"],
        difficulty: "Intermediate",
        description: "The king of posterior chain movements. Builds raw pulling strength from floor to lockout.",
        cues: ["Bar over mid-foot, shoulder-width stance","Hinge at hips — push the floor away, don't pull up","Neutral spine throughout — no rounding","Squeeze glutes at lockout","Control the descent — don't drop it"],
        riskNote: "Main risk: lumbar rounding under load. High-risk if done incorrectly."),
    ExerciseInfo(id: "lunge", name: "Lunge", muscles: ["Quads","Glutes","Hamstrings","Calves"],
        difficulty: "Beginner",
        description: "A unilateral leg exercise that builds balance, coordination, and single-leg strength.",
        cues: ["Step forward long enough that shin stays vertical","Keep torso upright — don't lean forward","Front knee tracks over second toe","Lower back knee toward the floor","Push through front heel to return"],
        riskNote: "Main risk: front knee driving past the toes."),
    ExerciseInfo(id: "pullup", name: "Pull-Up", muscles: ["Lats","Biceps","Rear Delts","Core"],
        difficulty: "Intermediate",
        description: "The gold-standard upper-body pulling exercise. Tests and builds relative strength.",
        cues: ["Dead hang start — full arm extension","Drive elbows down and back to initiate","Chin clears the bar at the top","Controlled descent — no dropping","Avoid swinging or kipping"],
        riskNote: "Main risk: shoulder impingement from improper scapular engagement."),
    ExerciseInfo(id: "plank", name: "Plank", muscles: ["Core","Shoulders","Glutes"],
        difficulty: "Beginner",
        description: "An isometric hold that builds anti-extension core strength and total-body stability.",
        cues: ["Elbows directly under shoulders","Body forms a straight line","Squeeze glutes and brace abs hard","Don't let hips sag or pike","Breathe steadily throughout"],
        riskNote: "Main risk: hip sag causing lower back compression."),
    ExerciseInfo(id: "benchpress", name: "Bench Press", muscles: ["Chest","Triceps","Shoulders"],
        difficulty: "Intermediate",
        description: "The premier horizontal pushing movement for upper-body strength.",
        cues: ["Arch your back slightly — shoulder blades retracted","Bar path from lower chest to over shoulders","Elbows 45–75° from torso","Touch chest at bottom","Full lockout at top"],
        riskNote: "Main risk: shoulder impingement from excessive elbow flare."),
    ExerciseInfo(id: "shoulderpress", name: "Shoulder Press", muscles: ["Shoulders","Triceps","Upper Traps"],
        difficulty: "Intermediate",
        description: "A vertical pressing movement for overhead shoulder strength and stability.",
        cues: ["Grip slightly wider than shoulders","Bar starts at upper chest / clavicle","Press straight up — slight backward lean is OK","Squeeze at top — don't hyperextend","Control the descent"],
        riskNote: "Main risk: lower back extension under heavy load."),
]

struct ExerciseLibraryView: View {
    @State private var search = ""

    private var filtered: [ExerciseInfo] {
        search.isEmpty ? EXERCISE_LIBRARY
            : EXERCISE_LIBRARY.filter {
                $0.name.localizedCaseInsensitiveContains(search) ||
                $0.muscles.joined().localizedCaseInsensitiveContains(search)
            }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(filtered) { ex in
                    NavigationLink(destination: ExerciseDetailView(exercise: ex)) {
                        ExerciseRow(exercise: ex)
                    }
                    .listRowBackground(Color("Surface"))
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color("Background"))
            .searchable(text: $search, prompt: "Search exercises or muscles…")
            .navigationTitle("Exercise Library")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct ExerciseRow: View {
    let exercise: ExerciseInfo
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(exercise.name).font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                Spacer()
                Text(exercise.difficulty)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(difficultyColor(exercise.difficulty))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(difficultyColor(exercise.difficulty).opacity(0.12))
                    .clipShape(Capsule())
            }
            Text(exercise.muscles.joined(separator: " · "))
                .font(.system(size: 11)).foregroundColor(.gray)
        }
        .padding(.vertical, 4)
    }
    private func difficultyColor(_ d: String) -> Color {
        d == "Beginner" ? .green : d == "Intermediate" ? .yellow : .red
    }
}

struct ExerciseDetailView: View {
    let exercise: ExerciseInfo

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(exercise.difficulty)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.gray).textCase(.uppercase).tracking(1)
                        Spacer()
                    }
                    Text(exercise.description)
                        .font(.system(size: 14)).foregroundColor(.gray).fixedSize(horizontal: false, vertical: true)
                    // Muscle chips
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(exercise.muscles, id: \.self) { m in
                                Text(m).font(.system(size: 11, weight: .semibold))
                                    .foregroundColor(Color("Accent"))
                                    .padding(.horizontal, 10).padding(.vertical, 4)
                                    .background(Color("Accent").opacity(0.1)).clipShape(Capsule())
                            }
                        }
                    }
                }
                .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))

                // Form cues
                VStack(alignment: .leading, spacing: 12) {
                    sectionLabel("Form Cues")
                    ForEach(Array(exercise.cues.enumerated()), id: \.offset) { i, cue in
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(i+1)")
                                .font(.system(size: 12, weight: .black))
                                .foregroundColor(Color("Accent"))
                                .frame(width: 20, alignment: .center)
                            Text(cue).font(.system(size: 13)).foregroundColor(.white)
                        }
                    }
                }
                .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))

                // Risk note
                VStack(alignment: .leading, spacing: 8) {
                    sectionLabel("Injury Risk")
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundColor(.yellow)
                        Text(exercise.riskNote).font(.system(size: 13)).foregroundColor(.white.opacity(0.85))
                    }
                }
                .padding().background(Color("Surface")).clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .padding()
        }
        .background(Color("Background"))
        .navigationTitle(exercise.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
