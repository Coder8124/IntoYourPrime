import SwiftUI

// MARK: - Shared view helpers used across multiple files

func sectionLabel(_ text: String) -> some View {
    Text(text)
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(.gray)
        .textCase(.uppercase)
        .tracking(1)
}

struct StatCard: View {
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 22, weight: .black))
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.gray)
                .textCase(.uppercase)
                .tracking(1)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color("Surface"))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
