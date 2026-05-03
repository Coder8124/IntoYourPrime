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

// MARK: - ProminentButtonStyle

struct ProminentButtonStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(color.opacity(configuration.isPressed ? 0.75 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - SliderRow

struct SliderRow: View {
    let label:  String
    @Binding var value: Double
    let range:  ClosedRange<Double>
    let step:   Double.Stride
    let format: String

    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.gray)
                    .textCase(.uppercase)
                    .tracking(0.8)
                Spacer()
                Text(String(format: format, value))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
            }
            Slider(value: $value, in: range, step: step)
                .tint(Color("Accent"))
        }
    }
}
