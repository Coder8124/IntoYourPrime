import Vision
import CoreImage
import UIKit

struct DetectedPose {
    struct Joint {
        var name:       VNHumanBodyPoseObservation.JointName
        var position:   CGPoint
        var confidence: Float
    }
    var joints: [VNHumanBodyPoseObservation.JointName: Joint]
    var riskScore: Int
}

@MainActor
final class PoseDetectionService: ObservableObject {
    @Published var currentPose: DetectedPose?
    @Published var riskScore: Int = 0

    private let request = VNDetectHumanBodyPoseRequest()
    private var repTracker = RepTracker()

    var onRepCounted: ((Int) -> Void)?

    func process(sampleBuffer: CMSampleBuffer, exercise: String) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        try? handler.perform([request])

        guard let observation = request.results?.first else { return }

        let joints = extractJoints(from: observation)
        let pose   = DetectedPose(joints: joints, riskScore: estimateRisk(joints: joints, exercise: exercise))

        let repCount = repTracker.update(pose: pose, exercise: exercise)

        Task { @MainActor in
            self.currentPose = pose
            self.riskScore   = pose.riskScore
            if let count = repCount { self.onRepCounted?(count) }
        }
    }

    func resetReps() { repTracker.reset() }

    // MARK: - Joint extraction

    private func extractJoints(from obs: VNHumanBodyPoseObservation) -> [VNHumanBodyPoseObservation.JointName: DetectedPose.Joint] {
        var result: [VNHumanBodyPoseObservation.JointName: DetectedPose.Joint] = [:]
        let names: [VNHumanBodyPoseObservation.JointName] = [
            .nose, .neck, .leftShoulder, .rightShoulder,
            .leftElbow, .rightElbow, .leftWrist, .rightWrist,
            .leftHip, .rightHip, .leftKnee, .rightKnee,
            .leftAnkle, .rightAnkle,
        ]
        for name in names {
            if let point = try? obs.recognizedPoint(name), point.confidence > 0.3 {
                result[name] = DetectedPose.Joint(
                    name:       name,
                    position:   CGPoint(x: point.x, y: 1 - point.y),  // flip Y for UIKit coords
                    confidence: point.confidence
                )
            }
        }
        return result
    }

    // MARK: - Risk estimation

    private func estimateRisk(joints: [VNHumanBodyPoseObservation.JointName: DetectedPose.Joint], exercise: String) -> Int {
        var score = 0
        switch exercise.lowercased() {
        case "squat":
            score = squatRisk(joints: joints)
        case "pushup", "push-up":
            score = pushupRisk(joints: joints)
        case "deadlift":
            score = deadliftRisk(joints: joints)
        default:
            score = genericRisk(joints: joints)
        }
        return min(100, max(0, score))
    }

    private func squatRisk(joints: [VNHumanBodyPoseObservation.JointName: DetectedPose.Joint]) -> Int {
        guard
            let lKnee  = joints[.leftKnee],
            let rKnee  = joints[.rightKnee],
            let lAnkle = joints[.leftAnkle],
            let rAnkle = joints[.rightAnkle],
            let lHip   = joints[.leftHip],
            let rHip   = joints[.rightHip]
        else { return 0 }

        let kneeX   = (lKnee.position.x  + rKnee.position.x)  / 2
        let ankleX  = (lAnkle.position.x + rAnkle.position.x) / 2
        let kneeOver = abs(kneeX - ankleX)

        let hipY  = (lHip.position.y  + rHip.position.y)  / 2
        let kneeY = (lKnee.position.y + rKnee.position.y) / 2
        let depth = hipY - kneeY

        var risk = 0
        if kneeOver > 0.15 { risk += 30 }  // knees caving/flaring
        if depth > 0.05    { risk += 20 }  // not deep enough
        return risk
    }

    private func pushupRisk(joints: [VNHumanBodyPoseObservation.JointName: DetectedPose.Joint]) -> Int {
        guard
            let lShoulder = joints[.leftShoulder],
            let lHip      = joints[.leftHip],
            let lAnkle    = joints[.leftAnkle]
        else { return 0 }

        let shoulderY = lShoulder.position.y
        let hipY      = lHip.position.y
        let ankleY    = lAnkle.position.y

        let expectedHipY = shoulderY + (ankleY - shoulderY) * 0.5
        let sag          = abs(hipY - expectedHipY)

        return sag > 0.08 ? 40 : 0
    }

    private func deadliftRisk(joints: [VNHumanBodyPoseObservation.JointName: DetectedPose.Joint]) -> Int {
        guard
            let neck = joints[.neck],
            let lHip = joints[.leftHip]
        else { return 0 }

        let spineAngle = atan2(abs(neck.position.x - lHip.position.x),
                               abs(neck.position.y - lHip.position.y))
        return spineAngle > 0.4 ? 50 : 0  // excessive forward lean
    }

    private func genericRisk(joints: [VNHumanBodyPoseObservation.JointName: DetectedPose.Joint]) -> Int {
        return 0
    }
}

// MARK: - Rep counting

private struct RepTracker {
    private var lastY:   CGFloat = 0
    private var phase:   Phase   = .up
    private var count:   Int     = 0
    private let threshold: CGFloat = 0.06

    enum Phase { case up, down }

    mutating func update(pose: DetectedPose, exercise: String) -> Int? {
        let signal = signalJoint(for: exercise, pose: pose)
        guard let y = signal else { return nil }

        switch phase {
        case .up:
            if y - lastY > threshold {
                phase = .down
                lastY = y
            }
        case .down:
            if lastY - y > threshold {
                phase = .up
                lastY = y
                count += 1
                return count
            }
        }
        lastY = y
        return nil
    }

    private func signalJoint(for exercise: String, pose: DetectedPose) -> CGFloat? {
        switch exercise.lowercased() {
        case "squat":
            return pose.joints[.leftHip]?.position.y
        case "pushup", "push-up":
            return pose.joints[.leftShoulder]?.position.y
        case "pull-up":
            return pose.joints[.leftWrist]?.position.y
        default:
            return pose.joints[.leftWrist]?.position.y
        }
    }

    mutating func reset() { count = 0; phase = .up; lastY = 0 }
}
