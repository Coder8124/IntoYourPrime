import SwiftUI
import Firebase

@main
struct IntoYourPrimeApp: App {
    @StateObject private var appState   = AppState()
    @StateObject private var themeManager = ThemeManager()

    init() {
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .environmentObject(themeManager)
                .tint(themeManager.accent)
                .preferredColorScheme(themeManager.colorScheme)
        }
    }
}
