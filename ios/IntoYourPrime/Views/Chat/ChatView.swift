import SwiftUI

struct ChatView: View {
    @EnvironmentObject private var appState: AppState
    @State private var messages: [ChatMessage] = []
    @State private var input    = ""
    @State private var loading  = false
    @State private var error    = ""

    private let systemGreeting = ChatMessage(role: "assistant",
        text: "Hey! I'm your AI trainer. Ask me anything about form, recovery, programming, or nutrition.")

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            BubbleView(msg: systemGreeting)
                            ForEach(messages) { BubbleView(msg: $0).id($0.id) }
                            if loading {
                                HStack {
                                    TypingIndicator()
                                    Spacer()
                                }
                                .padding(.horizontal)
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
    }

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField("Ask your coach…", text: $input, axis: .vertical)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .padding(12)
                .background(Color("Surface"))
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .lineLimit(4)

            Button {
                Task { await send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundColor(input.isEmpty || loading ? Color.gray : Color("Accent"))
            }
            .disabled(input.isEmpty || loading)
        }
        .padding()
        .background(Color("Surface").opacity(0.8))
    }

    private func send() async {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        input   = ""
        error   = ""
        loading = true
        messages.append(ChatMessage(role: "user", text: text))

        let history = messages.map { ["role": $0.role, "content": $0.text] }
        let d = UserDefaults.standard
        let profile = UserProfile(
            name:         d.string(forKey: "name") ?? "",
            age:          d.integer(forKey: "age") == 0 ? 25 : d.integer(forKey: "age"),
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
            error = "Monthly AI limit reached."
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
                    .font(.system(size: 18))
                    .foregroundColor(Color("Accent"))
                    .frame(width: 32, height: 32)
                    .background(Color("Accent").opacity(0.12))
                    .clipShape(Circle())
            }

            Text(msg.text)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(isUser ? Color("Accent") : Color("Surface"))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            if !isUser { Spacer(minLength: 48) }
        }
    }
}

struct TypingIndicator: View {
    @State private var phase = 0
    let dots = ["●", "●", "●"]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                Text("●")
                    .font(.system(size: 8))
                    .foregroundColor(Color("Accent").opacity(phase == i ? 1 : 0.3))
                    .animation(.easeInOut(duration: 0.4).delay(Double(i) * 0.15).repeatForever(), value: phase)
            }
        }
        .padding(12)
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .onAppear {
            withAnimation { phase = 2 }
        }
    }
}
