import SwiftUI

func sectionLabel(_ text: String) -> some View {
    Text(text)
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(.gray)
        .textCase(.uppercase)
        .tracking(1)
}
