import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var sub = SubscriptionService.shared
    @State private var profile: UserProfile?
    @State private var name     = ""
    @State private var age      = ""
    @State private var weight   = ""
    @State private var level    = "intermediate"
    @State private var saved    = false

    private let levels = ["beginner", "intermediate", "advanced"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    avatarHeader
                    subscriptionPanel
                    profileForm
                    signOutButton
                }
                .padding()
            }
            .background(Color("Background"))
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await loadProfile() }
    }

    private var avatarHeader: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(Color("Accent").opacity(0.15))
                    .frame(width: 80, height: 80)
                Text(initials)
                    .font(.system(size: 28, weight: .black))
                    .foregroundColor(Color("Accent"))
            }
            Text(appState.currentUser?.displayName ?? "Athlete")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)
            Text(appState.currentUser?.email ?? "")
                .font(.system(size: 13))
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var initials: String {
        let n = appState.currentUser?.displayName ?? ""
        return n.components(separatedBy: " ")
                .compactMap(\.first)
                .prefix(2)
                .map(String.init)
                .joined()
                .uppercased()
    }

    private var subscriptionPanel: some View {
        SubscriptionPanelView()
    }

    private var profileForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionLabel("Your Stats")

            LabeledTextField("Name", text: $name)
            LabeledTextField("Age", text: $age, keyboard: .numberPad)
            LabeledTextField("Weight (kg)", text: $weight, keyboard: .decimalPad)

            VStack(alignment: .leading, spacing: 6) {
                Text("Fitness Level")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.gray)
                    .textCase(.uppercase)
                    .tracking(1)
                Picker("Level", selection: $level) {
                    ForEach(levels, id: \.self) { Text($0.capitalized).tag($0) }
                }
                .pickerStyle(.segmented)
            }

            Button {
                Task { await saveProfile() }
            } label: {
                Text(saved ? "Saved ✓" : "Save")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(saved ? Color.green : Color("Accent"))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var signOutButton: some View {
        Button(role: .destructive) {
            try? AuthService.shared.signOut()
        } label: {
            Text("Sign Out")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.red)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func loadProfile() async {
        guard let uid = appState.currentUser?.uid else { return }
        profile = try? await FirestoreService.shared.fetchProfile(uid: uid)
        if let p = profile {
            name   = p.name
            age    = "\(p.age)"
            weight = "\(p.weight)"
            level  = p.fitnessLevel
        }
    }

    private func saveProfile() async {
        guard let uid = appState.currentUser?.uid else { return }
        let p = UserProfile(
            name:         name,
            age:          Int(age) ?? 25,
            weight:       Double(weight) ?? 70,
            fitnessLevel: level,
            email:        appState.currentUser?.email ?? ""
        )
        UserDefaults.standard.set(p.name,         forKey: "name")
        UserDefaults.standard.set(p.age,          forKey: "age")
        UserDefaults.standard.set(p.weight,       forKey: "weight")
        UserDefaults.standard.set(p.fitnessLevel, forKey: "fitnessLevel")
        try? await FirestoreService.shared.saveProfile(p, uid: uid)
        saved = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saved = false }
    }
}

struct SubscriptionPanelView: View {
    @ObservedObject private var sub = SubscriptionService.shared
    @EnvironmentObject  private var appState: AppState
    @State private var checkingOut = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                sectionLabel("AI Settings")
                Spacer()
                statusBadge
            }

            if sub.isActive {
                activeContent
            } else {
                goProContent
            }
        }
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var statusBadge: some View {
        Text(sub.isActive ? "Pro ✓" : "No plan")
            .font(.system(size: 10, weight: .bold))
            .textCase(.uppercase)
            .tracking(1)
            .foregroundColor(sub.isActive ? Color("Accent") : .gray)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background((sub.isActive ? Color("Accent") : Color.gray).opacity(0.12))
            .clipShape(Capsule())
    }

    private var activeContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Monthly usage")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.gray)
                    .textCase(.uppercase)
                Spacer()
                if let end = sub.status.currentPeriodEnd,
                   let date = ISO8601DateFormatter().date(from: end) {
                    Text("Resets \(date.formatted(.dateTime.month().day()))")
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(Color.white.opacity(0.08)).frame(height: 8)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(barColor)
                        .frame(width: geo.size.width * CGFloat(sub.status.usagePct) / 100, height: 8)
                }
            }
            .frame(height: 8)
            Text("\(sub.status.usagePct)% used")
                .font(.system(size: 10))
                .foregroundColor(.gray)

            Link("Manage subscription ↗", destination: URL(string: "https://app.lemonsqueezy.com/my-orders")!)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 10)
                .background(Color("Background"))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private var barColor: Color {
        let p = sub.status.usagePct
        if p >= 90 { return .red }
        if p >= 70 { return .yellow }
        return Color("Accent")
    }

    private var goProContent: some View {
        VStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text("✨ Go Pro — $15 / month")
                    .font(.system(size: 15, weight: .black))
                    .foregroundColor(.white)
                Text("Full AI coaching, injury risk scoring, personalized cooldowns — no API key needed.")
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding()
            .background(Color("Accent").opacity(0.06))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color("Accent").opacity(0.2), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Button {
                Task { await startCheckout() }
            } label: {
                Group {
                    if checkingOut {
                        ProgressView().tint(.white)
                    } else {
                        Text("Subscribe →")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color("Accent"))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(checkingOut)
        }
    }

    private func startCheckout() async {
        guard let uid = appState.currentUser?.uid,
              let email = appState.currentUser?.email else { return }
        checkingOut = true
        defer { checkingOut = false }
        guard let url = try? await AIService.shared.createCheckoutURL(uid: uid, email: email) else { return }
        await UIApplication.shared.open(url)
    }
}

private func sectionLabel(_ text: String) -> some View {
    Text(text)
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(.gray)
        .textCase(.uppercase)
        .tracking(1)
}

struct LabeledTextField: View {
    let label:    String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.gray)
                .textCase(.uppercase)
                .tracking(1)
            TextField(label, text: $text)
                .keyboardType(keyboard)
                .font(.system(size: 15))
                .foregroundColor(.white)
                .padding(12)
                .background(Color("Background"))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}
