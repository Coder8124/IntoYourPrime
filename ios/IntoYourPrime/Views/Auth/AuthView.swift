import SwiftUI

struct AuthView: View {
    @State private var mode: Mode = .signIn
    @State private var email    = ""
    @State private var password = ""
    @State private var name     = ""
    @State private var errorMsg = ""
    @State private var loading  = false

    enum Mode { case signIn, signUp }

    var body: some View {
        ZStack {
            Color("Background").ignoresSafeArea()

            ScrollView {
                VStack(spacing: 28) {
                    Spacer().frame(height: 60)

                    // Brand
                    VStack(spacing: 6) {
                        Text("💪").font(.system(size: 48))
                        Text("IntoYourPrime")
                            .font(.system(size: 26, weight: .black, design: .rounded))
                            .foregroundColor(.white)
                        Text("AI Workout Coach")
                            .font(.system(size: 13))
                            .foregroundColor(.gray)
                    }

                    // Mode toggle
                    HStack(spacing: 0) {
                        ForEach([Mode.signIn, .signUp], id: \.self) { m in
                            Button(m == .signIn ? "Sign In" : "Sign Up") { mode = m }
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(mode == m ? .white : .gray)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(mode == m ? Color("Accent") : Color.clear)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                    }
                    .padding(4)
                    .background(Color("Surface"))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .padding(.horizontal, 32)

                    // Fields
                    VStack(spacing: 14) {
                        if mode == .signUp {
                            AuthField("Full Name", text: $name, icon: "person")
                        }
                        AuthField("Email", text: $email, icon: "envelope", keyboard: .emailAddress)
                        AuthField("Password", text: $password, icon: "lock", secure: true)
                    }
                    .padding(.horizontal, 24)

                    if !errorMsg.isEmpty {
                        Text(errorMsg)
                            .font(.system(size: 12))
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }

                    Button {
                        Task { await submit() }
                    } label: {
                        Group {
                            if loading {
                                ProgressView().tint(.white)
                            } else {
                                Text(mode == .signIn ? "Sign In" : "Create Account")
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundColor(.white)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color("Accent"))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .disabled(loading)
                    .padding(.horizontal, 24)
                }
                .padding(.bottom, 40)
            }
        }
    }

    private func submit() async {
        errorMsg = ""
        loading  = true
        defer { loading = false }
        do {
            if mode == .signIn {
                try await AuthService.shared.signIn(email: email, password: password)
            } else {
                guard !name.isEmpty else { errorMsg = "Name is required."; return }
                try await AuthService.shared.signUp(email: email, password: password, name: name)
            }
        } catch {
            errorMsg = error.localizedDescription
        }
    }
}

struct AuthField: View {
    let title:    String
    @Binding var text: String
    var icon:     String
    var keyboard: UIKeyboardType = .default
    var secure    = false

    init(_ title: String, text: Binding<String>, icon: String,
         keyboard: UIKeyboardType = .default, secure: Bool = false) {
        self.title   = title
        self._text   = text
        self.icon    = icon
        self.keyboard = keyboard
        self.secure  = secure
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(.gray)
                .frame(width: 20)
            if secure {
                SecureField(title, text: $text)
            } else {
                TextField(title, text: $text)
                    .keyboardType(keyboard)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
            }
        }
        .font(.system(size: 15))
        .foregroundColor(.white)
        .padding(14)
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
