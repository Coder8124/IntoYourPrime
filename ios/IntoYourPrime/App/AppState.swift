import Foundation
import FirebaseAuth
import Combine

@MainActor
final class AppState: ObservableObject {
    @Published var currentUser: User?
    @Published var isLoading = true

    private var authHandle: AuthStateDidChangeListenerHandle?

    init() {
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            guard let self else { return }
            Task { @MainActor in
                self.currentUser = user
                self.isLoading   = false
                if let user {
                    await SubscriptionService.shared.load(uid: user.uid)
                } else {
                    SubscriptionService.shared.clear()
                }
            }
        }
    }

    deinit {
        if let h = authHandle { Auth.auth().removeStateDidChangeListener(h) }
    }
}
