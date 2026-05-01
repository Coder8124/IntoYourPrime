import SwiftUI

struct WorkoutCalendarView: View {
    @EnvironmentObject private var appState: AppState
    @State private var sessions: [WorkoutSession] = []
    @State private var selected: Date = .now

    private var calendar = Calendar.current

    private var sessionDates: Set<DateComponents> {
        Set(sessions.map { calendar.dateComponents([.year, .month, .day], from: $0.date) })
    }

    private var sessionsOnSelected: [WorkoutSession] {
        sessions.filter { calendar.isDate($0.date, inSameDayAs: selected) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    DatePicker("", selection: $selected, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .tint(Color("Accent"))
                        .padding()
                        .background(Color("Surface"))
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    if sessionsOnSelected.isEmpty {
                        Text("No workouts on this day")
                            .font(.system(size: 13))
                            .foregroundColor(.gray)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color("Surface"))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    } else {
                        VStack(alignment: .leading, spacing: 12) {
                            sectionLabel(selected.formatted(date: .complete, time: .omitted))
                            ForEach(sessionsOnSelected) { s in
                                SessionRow(session: s)
                            }
                        }
                        .padding()
                        .background(Color("Surface"))
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                }
                .padding()
            }
            .background(Color("Background"))
            .navigationTitle("Calendar")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await load() }
    }

    private func load() async {
        guard let uid = appState.currentUser?.uid else { return }
        sessions = (try? await FirestoreService.shared.fetchSessions(uid: uid, limit: 100)) ?? []
    }
}
