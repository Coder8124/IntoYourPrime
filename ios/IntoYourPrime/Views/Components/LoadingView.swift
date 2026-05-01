import SwiftUI

struct LoadingView: View {
    var body: some View {
        ZStack {
            Color("Background").ignoresSafeArea()
            VStack(spacing: 16) {
                Text("💪").font(.system(size: 48))
                Text("IntoYourPrime")
                    .font(.system(size: 22, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                ProgressView().tint(Color("Accent"))
            }
        }
    }
}
