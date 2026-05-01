# IntoYourPrime — iOS App

SwiftUI app with full feature parity to the web version.

## Setup

### 1. Create Xcode project

1. Open Xcode → File → New → Project → iOS → App
2. Product Name: `IntoYourPrime`, Bundle ID: `com.intoyourprime.app`
3. Language: Swift, Interface: SwiftUI
4. Save into this `ios/` directory (it will create the `.xcodeproj` alongside)
5. Delete the generated `ContentView.swift` and drag in the `IntoYourPrime/` source folder

### 2. Add Swift Package dependencies

File → Add Package Dependencies:

| Package | URL | Products |
|---|---|---|
| Firebase iOS SDK | `https://github.com/firebase/firebase-ios-sdk` | FirebaseAuth, FirebaseFirestore |
| Google Sign-In | `https://github.com/google/GoogleSignIn-iOS` | GoogleSignIn |

### 3. Add GoogleService-Info.plist

Download from Firebase Console → Project Settings → iOS app → GoogleService-Info.plist  
Drag it into the Xcode project root (check "Copy items if needed").

### 4. Configure Google Sign-In URL scheme

In Xcode → Target → Info → URL Types:  
Add a URL scheme equal to the `REVERSED_CLIENT_ID` from `GoogleService-Info.plist`.

### 5. Update Info.plist

Replace `YOUR_REVERSED_CLIENT_ID_HERE` with the actual value.

## Architecture

```
App/
  IntoYourPrimeApp.swift   — @main, Firebase init
  AppState.swift           — Auth state, subscription seed
  ContentView.swift        — Root/Tab navigation

Models/
  Models.swift             — All data types

Services/
  CameraService.swift      — AVFoundation, front/back toggle
  PoseDetectionService.swift — Vision body pose + rep counting
  AuthService.swift        — Firebase Auth + Google Sign-In
  FirestoreService.swift   — Firestore CRUD
  AIService.swift          — Vercel API calls (analyze, cooldown, chat, etc.)
  SubscriptionService.swift — Pro subscription status

Views/
  Auth/         AuthView
  Home/         HomeView, ClipCoachCard (video upload → AI analysis)
  Workout/      WorkoutView (live camera + pose + rep counter + form analysis)
                CameraPreviewView, PoseOverlayView, CooldownView
  Recovery/     RecoveryLogView
  Profile/      ProfileView, SubscriptionPanelView (Pro upsell / usage bar)
  Progress/     ProgressView (Charts)
  Calendar/     WorkoutCalendarView
  Basketball/   BasketballView (shot tracker with camera flip)
  Programs/     ProgramsView, AIWorkoutGeneratorView
  Friends/      FriendsView
  Leaderboard/  LeaderboardView
  Measurements/ MeasurementsView (weight chart)
  Chat/         ChatView (AI trainer chat)
  Components/   LoadingView, Helpers
```

## Camera front/back toggle

Every camera view (Workout, Basketball) has a flip button:

```swift
Button { camera.toggleCamera() } label: {
    Image(systemName: "arrow.triangle.2.circlepath.camera.fill")
}
```

`CameraService.toggleCamera()` calls `AVCaptureSession.beginConfiguration()`,
swaps the `AVCaptureDeviceInput` for the other position, mirrors the video
connection for the front camera, then commits — all without stopping the session.

## Pro subscription

- Subscription status is fetched from `GET /api/subscription-status` on login
- All AI calls (form analysis, cooldown, chat, program generation) gate on
  `SubscriptionService.shared.isActive` and send `Authorization: Bearer <idToken>`
- The "Go Pro" button in Profile → AI Settings redirects to Lemon Squeezy checkout
  via `POST /api/ls-checkout` (same Vercel backend as web)
- Usage progress bar shows `usagePct` from the status endpoint (no dollar amounts)
