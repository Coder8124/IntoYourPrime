import AVFoundation
import UIKit
import Combine

@MainActor
final class CameraService: NSObject, ObservableObject {
    @Published var currentPosition: AVCaptureDevice.Position = .front
    @Published var isRunning = false
    @Published var permissionGranted = false

    let session = AVCaptureSession()
    private var currentInput: AVCaptureDeviceInput?
    private let videoOutput = AVCaptureVideoDataOutput()
    private let outputQueue  = DispatchQueue(label: "com.intoyourprime.camera", qos: .userInteractive)

    var frameHandler: ((CMSampleBuffer) -> Void)?

    func requestPermission() async {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        if status == .authorized {
            permissionGranted = true
        } else if status == .notDetermined {
            permissionGranted = await AVCaptureDevice.requestAccess(for: .video)
        }
    }

    func start(position: AVCaptureDevice.Position = .front) {
        guard permissionGranted else { return }
        Task.detached { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            self.session.sessionPreset = .hd1280x720

            self.configureInput(position: position)
            self.configureOutput()

            self.session.commitConfiguration()
            self.session.startRunning()

            await MainActor.run { self.isRunning = true }
        }
    }

    func stop() {
        Task.detached { [weak self] in
            self?.session.stopRunning()
            await MainActor.run { self?.isRunning = false }
        }
    }

    func toggleCamera() {
        let next: AVCaptureDevice.Position = currentPosition == .back ? .front : .back
        switchCamera(to: next)
        currentPosition = next
    }

    // MARK: - Private

    private func configureInput(position: AVCaptureDevice.Position) {
        if let existing = currentInput {
            session.removeInput(existing)
            currentInput = nil
        }
        guard
            let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
            let input  = try? AVCaptureDeviceInput(device: device),
            session.canAddInput(input)
        else { return }

        session.addInput(input)
        currentInput  = input
    }

    private func configureOutput() {
        guard session.outputs.isEmpty else { return }
        videoOutput.setSampleBufferDelegate(self, queue: outputQueue)
        videoOutput.alwaysDiscardsLateVideoFrames = true
        if session.canAddOutput(videoOutput) { session.addOutput(videoOutput) }
        videoOutput.connection(with: .video)?.videoRotationAngle = 90
    }

    private func switchCamera(to position: AVCaptureDevice.Position) {
        Task.detached { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            self.configureInput(position: position)

            // Fix mirroring for front camera
            if let conn = self.videoOutput.connection(with: .video) {
                conn.isVideoMirrored = (position == .front)
            }

            self.session.commitConfiguration()
        }
    }
}

extension CameraService: AVCaptureVideoDataOutputSampleBufferDelegate {
    nonisolated func captureOutput(_ output: AVCaptureOutput,
                                   didOutput sampleBuffer: CMSampleBuffer,
                                   from connection: AVCaptureConnection) {
        frameHandler?(sampleBuffer)
    }
}
