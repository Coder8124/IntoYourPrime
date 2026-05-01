import FirebaseAuth
import GoogleSignIn
import UIKit

enum AuthError: LocalizedError {
    case invalidCredentials
    case networkError
    case unknown(Error)

    var errorDescription: String? {
        switch self {
        case .invalidCredentials: return "Invalid email or password."
        case .networkError:       return "Network error. Check your connection."
        case .unknown(let e):     return e.localizedDescription
        }
    }
}

final class AuthService {
    static let shared = AuthService()

    var currentUser: User? { Auth.auth().currentUser }

    func signIn(email: String, password: String) async throws {
        try await Auth.auth().signIn(withEmail: email, password: password)
    }

    func signUp(email: String, password: String, name: String) async throws {
        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        let change = result.user.createProfileChangeRequest()
        change.displayName = name
        try await change.commitChanges()
    }

    func signInWithGoogle(presenting vc: UIViewController) async throws {
        guard let clientID = FirebaseApp.app()?.options.clientID else { return }
        let config = GIDConfiguration(clientID: clientID)
        GIDSignIn.sharedInstance.configuration = config

        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: vc)
        let user   = result.user
        guard let idToken = user.idToken?.tokenString else { return }
        let credential = GoogleAuthProvider.credential(
            withIDToken: idToken,
            accessToken: user.accessToken.tokenString
        )
        try await Auth.auth().signIn(with: credential)
    }

    func signOut() throws {
        try Auth.auth().signOut()
    }

    func idToken() async throws -> String {
        guard let user = currentUser else { throw AuthError.invalidCredentials }
        return try await user.getIDToken()
    }
}
