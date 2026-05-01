import SwiftUI

struct BasketballView: View {
    @StateObject private var camera = CameraService()
    @State private var attempts: [ShootingAttempt] = []
    @State private var isRecording = false

    private var made:   Int { attempts.filter(\.made).count  }
    private var total:  Int { attempts.count }
    private var pct:    String { total == 0 ? "—" : "\(Int(Double(made)/Double(total)*100))%" }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            CameraPreviewView(session: camera.session).ignoresSafeArea()

            VStack {
                // Camera flip
                HStack {
                    Spacer()
                    Button {
                        camera.toggleCamera()
                    } label: {
                        Image(systemName: "arrow.triangle.2.circlepath.camera.fill")
                            .font(.system(size: 20))
                            .foregroundColor(.white)
                            .padding(10)
                            .background(.ultraThinMaterial)
                            .clipShape(Circle())
                    }
                }
                .padding()

                Spacer()

                // Stats + controls
                VStack(spacing: 16) {
                    HStack(spacing: 32) {
                        Stat(label: "Made",  value: "\(made)")
                        Stat(label: "Total", value: "\(total)")
                        Stat(label: "%",     value: pct)
                    }

                    HStack(spacing: 16) {
                        Button("✓ Made") {
                            attempts.append(ShootingAttempt(made: true, timestamp: .now))
                        }
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 24).padding(.vertical, 12)
                        .background(Color.green.opacity(0.8))
                        .clipShape(RoundedRectangle(cornerRadius: 12))

                        Button("✗ Miss") {
                            attempts.append(ShootingAttempt(made: false, timestamp: .now))
                        }
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 24).padding(.vertical, 12)
                        .background(Color.red.opacity(0.8))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    if !attempts.isEmpty {
                        Button("Reset") { attempts.removeAll() }
                            .font(.system(size: 13))
                            .foregroundColor(.gray)
                    }
                }
                .padding()
                .background(.ultraThinMaterial)
            }
        }
        .navigationTitle("Basketball")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await camera.requestPermission()
            camera.start(position: .back)
        }
        .onDisappear { camera.stop() }
    }
}

private struct Stat: View {
    let label: String
    let value: String
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 28, weight: .black)).foregroundColor(.white)
            Text(label).font(.system(size: 11, weight: .semibold)).foregroundColor(.gray)
        }
    }
}
