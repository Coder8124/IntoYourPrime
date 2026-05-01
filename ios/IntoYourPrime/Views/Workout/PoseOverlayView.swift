import SwiftUI
import Vision

struct PoseOverlayView: View {
    let pose:     DetectedPose?
    let riskScore: Int

    private var riskColor: Color {
        if riskScore < 30 { return .green }
        if riskScore < 60 { return .yellow }
        return .red
    }

    var body: some View {
        GeometryReader { geo in
            if let pose {
                Canvas { ctx, size in
                    drawSkeleton(ctx: ctx, size: size, pose: pose)
                }

                // Risk badge
                VStack {
                    HStack {
                        Spacer()
                        Text("Risk \(riskScore)")
                            .font(.system(size: 13, weight: .black, design: .rounded))
                            .foregroundColor(riskColor)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(riskColor.opacity(0.15))
                            .overlay(RoundedRectangle(cornerRadius: 20).stroke(riskColor.opacity(0.4), lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                            .padding()
                    }
                    Spacer()
                }
            }
        }
    }

    private func drawSkeleton(ctx: GraphicsContext, size: CGSize, pose: DetectedPose) {
        let connections: [(VNHumanBodyPoseObservation.JointName, VNHumanBodyPoseObservation.JointName)] = [
            (.leftShoulder,  .rightShoulder),
            (.leftShoulder,  .leftElbow),
            (.leftElbow,     .leftWrist),
            (.rightShoulder, .rightElbow),
            (.rightElbow,    .rightWrist),
            (.leftShoulder,  .leftHip),
            (.rightShoulder, .rightHip),
            (.leftHip,       .rightHip),
            (.leftHip,       .leftKnee),
            (.leftKnee,      .leftAnkle),
            (.rightHip,      .rightKnee),
            (.rightKnee,     .rightAnkle),
        ]

        let color = riskScore < 30 ? Color.green : riskScore < 60 ? Color.yellow : Color.red

        // Draw bones
        for (a, b) in connections {
            guard let ja = pose.joints[a], let jb = pose.joints[b] else { continue }
            let pa = CGPoint(x: ja.position.x * size.width,  y: ja.position.y * size.height)
            let pb = CGPoint(x: jb.position.x * size.width,  y: jb.position.y * size.height)
            var path = Path()
            path.move(to: pa)
            path.addLine(to: pb)
            ctx.stroke(path, with: .color(color.opacity(0.85)), lineWidth: 2.5)
        }

        // Draw joints
        for joint in pose.joints.values {
            let pt = CGPoint(x: joint.position.x * size.width, y: joint.position.y * size.height)
            let rect = CGRect(x: pt.x - 4, y: pt.y - 4, width: 8, height: 8)
            ctx.fill(Path(ellipseIn: rect), with: .color(.white.opacity(0.9)))
        }
    }
}
