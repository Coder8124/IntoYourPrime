import SwiftUI

struct AppTheme: Identifiable {
    let id:        String
    let name:      String
    let primary:   Color
    let secondary: Color
}

let ALL_THEMES: [AppTheme] = [
    AppTheme(id: "electric",    name: "Electric",     primary: Color(hex: "#6b8cff"), secondary: Color(hex: "#a78bfa")),
    AppTheme(id: "ember",       name: "Ember",        primary: Color(hex: "#f59e0b"), secondary: Color(hex: "#fb7185")),
    AppTheme(id: "mint",        name: "Mint",         primary: Color(hex: "#5eead4"), secondary: Color(hex: "#a5f3fc")),
    AppTheme(id: "cottoncandy", name: "Cotton Candy", primary: Color(hex: "#f472b6"), secondary: Color(hex: "#67e8f9")),
    AppTheme(id: "air",         name: "Air",          primary: Color(hex: "#38bdf8"), secondary: Color(hex: "#a5f3fc")),
    AppTheme(id: "moltengold",  name: "Molten Gold",  primary: Color(hex: "#fbbf24"), secondary: Color(hex: "#f97316")),
]

final class ThemeManager: ObservableObject {
    @AppStorage("selectedTheme")     var themeId:   String = "electric"
    @AppStorage("preferredColorScheme") var isDark: Bool   = true

    var current: AppTheme {
        ALL_THEMES.first { $0.id == themeId } ?? ALL_THEMES[0]
    }

    var accent: Color    { current.primary    }
    var secondary: Color { current.secondary  }
    var colorScheme: ColorScheme { isDark ? .dark : .light }
}
