import Foundation

@MainActor
final class SubscriptionService: ObservableObject {
    static let shared = SubscriptionService()

    @Published var status: SubscriptionStatus = SubscriptionStatus(status: "none", currentPeriodEnd: nil, usagePct: 0)

    var isActive: Bool { status.isActive }

    func load(uid: String) async {
        guard let token = try? await AuthService.shared.idToken(),
              let url   = URL(string: "https://intoyourprime.vercel.app/api/subscription-status?uid=\(uid)")
        else { return }

        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        guard
            let (data, _) = try? await URLSession.shared.data(for: req),
            let decoded   = try? JSONDecoder().decode(SubscriptionStatus.self, from: data)
        else { return }

        status = decoded
    }

    func clear() {
        status = SubscriptionStatus(status: "none", currentPeriodEnd: nil, usagePct: 0)
    }
}
