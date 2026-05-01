import SwiftUI

struct ChatView: View {
    @EnvironmentObject private var appState: AppState
    @State private var messages: [ChatMessage] = []
    @State private var input    = ""
    @State private var loading  = false
    @State private var error    = ""
    @State private var sessions: [WorkoutSession] = []

    private let suggestions = [
        "How can I improve my squat depth?",
        "What should I eat after a hard workout?",
        "My lower back is sore — what exercises should I avoid?",
        "How many rest days do I need per week?",
        "Can you design a 4-day split for me?",
        "What's the difference between RPE and 1RM?",
    ]

    private let systemGreeting = ChatMessage(role: "assistant",
        text: "Hey! I'm your AI trainer. I have access to your recent workout history. Ask me anything about form, recovery, programming, or nutrition.")

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            BubbleView(msg: systemGreeting)

                            // Suggestion chips (shown when no messages yet)
                            if messages.isEmpty {
                                suggestionChips(proxy: proxy)
                            }

                            ForEach(messages) { BubbleView(msg: $0).id($0.id) }

                            if loading {
                                HStack { TypingIndicator(); Spacer() }.padding(.horizontal)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: messages.count) { _, _ in
                        if let last = messages.last {
                            withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                        }
                    }
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 11)).foregroundColor(.red).padding(.horizontal)
                }
                inputBar
            }
            .background(Color("Background"))
            .navigationTitle("AI Coach")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await loadContext() }
    }

    // MARK: - Suggestion chips

    private func suggestionChips(proxy: ScrollViewProxy) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(suggestions, id: \.self) { s in
                    Button {
                        input = s
                        Task { await send() }
                    } label: {
                        Text(s)
                            .font(.system(size: 12))
                            .foregroundColor(.white)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(Color("Surface"))
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal, 4)
        }
    }

    // MARK: - Input bar

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField("Ask your coach…", text: $input, axis: .vertical)
                .font(.system(size: 14)).foregroundColor(.white)
                .padding(12).background(Color("Surface"))
                .clipShape(RoundedRectangle(cornerRadius: 14)).lineLimit(4)

            Button { Task { await send() } } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundColor(input.isEmpty || loading ? Color.gray : Color("Accent"))
            }
            .disabled(input.isEmpty || loading)
        }
        .padding().background(Color("Surface").opacity(0.8))
    }

    // MARK: - Actions

    private func loadContext() async {
        guard let uid = appState.currentUser?.uid else { return }
        sessions = (try? await FirestoreService.shared.fetchSessions(uid: uid, limit: 7)) ?? []
    }

    private func send() async {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        input   = ""
        error   = ""
        loading = true
        messages.append(ChatMessage(role: "user", text: text))

        // Build history with session context injected as system context
        var history = messages.map { ["role": $0.role, "content": $0.text] }
        if !sessions.isEmpty {
            let summary = sessions.prefix(5).map {
                "\($0.exercise.capitalized): \($0.repCount) reps, avg risk \(Int($0.avgRiskScore))"
            }.joined(separator: "; ")
            history.insert(["role": "system", "content": "User's recent workouts: \(summary)"], at: 0)
        }

        let d = UserDefaults.standard
        let profile = UserProfile(
            name:         d.string(forKey: "name") ?? "",
            age:          d.integer(forKey: "age")  == 0 ? 25 : d.integer(forKey: "age"),
            weight:       d.double(forKey: "weight") == 0 ? 70 : d.double(forKey: "weight"),
            fitnessLevel: d.string(forKey: "fitnessLevel") ?? "intermediate",
            email:        appState.currentUser?.email ?? ""
        )

        do {
            let reply = try await AIService.shared.chat(messages: history, userProfile: profile)
            messages.append(ChatMessage(role: "assistant", text: reply))
        } catch AIError.notSubscribed {
            error = "Pro subscription required for AI coaching."
        } catch AIError.limitReached {
            error = "Monthly AI limit reached. Resets next billing cycle."
        } catch {
            self.error = "Couldn't reach coach. Try again."
        }
        loading = false
    }
}

struct BubbleView: View {
    let msg: ChatMessage
    private var isUser: Bool { msg.role == "user" }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isUser { Spacer(minLength: 48) }

            if !isUser {
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 18)).foregroundColor(Color("Accent"))
                    .frame(width: 32, height: 32)
                    .background(Color("Accent").opacity(0.12)).clipShape(Circle())
            }

            Text(msg.text)
                .font(.system(size: 14)).foregroundColor(.white)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(isUser ? Color("Accent") : Color("Surface"))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            if !isUser { Spacer(minLength: 48) }
        }
    }
}

struct TypingIndicator: View {
    @State private var dotIndex = 0

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color("Accent").opacity(dotIndex == i ? 1 : 0.25))
                    .frame(width: 7, height: 7)
            }
        }
        .padding(12)
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .onAppear {
            Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                dotIndex = (dotIndex + 1) % 3
            }
        }
    }
}
