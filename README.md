# IntoYourPrime

An AI-powered personal training app that provides real-time form coaching, injury risk scoring, rep counting, and recovery tracking — all running in the browser.

---

## Features

- **Real-time pose detection** — MediaPipe Pose tracks 33 body landmarks via webcam at 30fps
- **Exercise rep counting** — angle-based detection for squat, pushup, lunge, deadlift, shoulder press, curl-up, and bicep curl
- **AI form coaching** — GPT-4o analyzes live workout frames and gives specific, actionable cues
- **Injury risk scoring** — blended local geometry score + OpenAI vision score, updated every 15 seconds
- **Warmup quality gate** — rates warmup form 0–100 before allowing the main workout
- **AI cooldown generation** — GPT-4o-mini generates a personalized cooldown plan based on the session
- **Set counter** — press `S` or `Space` to mark a new set; history shown in sidebar
- **Session summary** — rep counts, avg/peak risk score, form suggestions, feel rating
- **Recovery logging** — daily sleep, energy, mood, soreness-per-muscle, RPE
- **Friend squads** — search users by display name, send/accept friend requests, shared streaks
- **Prime Intelligence** — group AI briefing with leaderboard, duo links, and warden's directive
- **OpenAI TTS** — spoken coaching cues (alloy voice), falls back to Web Speech API
- **Streak tracking** — consecutive workout day counter synced to Firestore

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS |
| Routing | React Router v6 |
| State | Zustand |
| Pose Detection | MediaPipe Pose 0.5 (CDN) |
| AI Coaching | OpenAI GPT-4o (vision) + TTS |
| Backend | Firebase Auth + Firestore |
| Build | Vite 8 |
| Deploy | Vercel |

---

## Project Structure

```
src/
├── components/
│   ├── RootRedirect.tsx       # Auth guard — redirects to /auth or /onboarding
│   └── BodySorenessMap.tsx    # Interactive per-muscle soreness selector
├── hooks/
│   ├── usePoseDetection.ts    # MediaPipe webcam loop, frame buffer, skeleton overlay
│   └── useRepCounter.ts       # Angle/position based rep counting for all exercises
├── lib/
│   ├── firebase.ts            # Firebase app initialization
│   ├── firebaseHelpers.ts     # Firestore CRUD — sessions, logs, users, friends
│   ├── firestoreUser.ts       # Auth state helpers, uid resolution
│   ├── formAnalysis.ts        # OpenAI vision analysis, TTS, cooldown generation
│   ├── primeIntelligence.ts   # Group AI coach — briefings, leaderboards, duo links
│   ├── localUserId.ts         # Offline/anonymous user id fallback
│   ├── recoveryLogLocal.ts    # localStorage wrapper for recovery logs
│   └── recoveryMuscles.ts     # Muscle group definitions
├── pages/
│   ├── AuthPage.tsx           # Email/password sign-in and sign-up
│   ├── OnboardingPage.tsx     # First-time profile setup
│   ├── HomePage.tsx           # Dashboard — streak, recent sessions, quick actions
│   ├── WorkoutPage.tsx        # Live workout — camera, reps, risk score, AI feedback
│   ├── SessionSummaryPage.tsx # Post-workout summary with stats and suggestions
│   ├── CooldownPage.tsx       # Timed cooldown exercises (AI-generated)
│   ├── RecoveryLogPage.tsx    # Daily health and soreness logging
│   ├── ProfilePage.tsx        # Profile editor, OpenAI key management, sign out
│   ├── FriendsPage.tsx        # Squad search, friend requests, Prime Intelligence
│   └── PipelineTestPage.tsx   # Internal test page for AI pipeline
├── stores/
│   └── workoutStore.ts        # Zustand store for active session state
├── types/
│   └── index.ts               # All shared TypeScript interfaces
└── App.tsx                    # Route definitions + auth sync on boot
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project with **Authentication** (email/password) and **Firestore** enabled
- An OpenAI API key (optional — basic mode works without it)

### 1. Clone and install

```bash
git clone https://github.com/your-org/IntoYourPrime.git
cd IntoYourPrime
npm install
```

### 2. Configure environment

Create a `.env` file at the project root:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# Optional — users can also enter their key in the Profile page
VITE_OPENAI_API_KEY=sk-proj-...
```

### 3. Deploy Firestore rules

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project your-project-id
```

Or paste the contents of `firestore.rules` into **Firebase Console → Firestore → Rules** and publish.

### 4. Run locally

```bash
npm run dev
```

---

## Firestore Security Rules

The `firestore.rules` file at the project root defines the access policy:

- `users/{uid}` — any authenticated user can **read** (enables friend search); only the owner can **write**
- `friendConnections/{connId}` — only participants can read/update; sender can create
- `sessions`, `dailyLogs` — owner only
- `activityFeed` — any authenticated user can read; owner can create

---

## Rep Counting Logic

Rep counting is fully local (no API calls). Each exercise uses a different anatomical signal:

| Exercise | Signal | How |
|---|---|---|
| Squat | Hip Y position | Hips drop → "down"; rise → "up"; rep on down→up |
| Pushup | Hip→Shoulder→Elbow angle | Arms extended = large angle ("down"); chest to floor = small ("up"); rep on up→down→up |
| Lunge | Knee Y position | Front knee drops → "down"; rises → "up" |
| Deadlift | Hip Y position | Hips hinge down → "down"; lock out → "up" |
| Shoulder Press | Wrist Y position | Wrists drop → "down"; press up → "up"; rep on up→down |
| Curl-up | `hipY − shoulderY` differential | Flat = ~0; curled = positive; camera-distance independent |
| Bicep Curl | Shoulder→Elbow→Wrist angle | Extended = ~160° ("down"); contracted = ~40° ("up") |

All signals use EMA smoothing (α=0.2), a 1-second calibration window, and a 1.2-second debounce between reps.

---

## AI Coaching

When an OpenAI API key is present:

- **Form analysis** runs every **15 seconds** (first call at 5s), sending 3–5 webcam frames to GPT-4o
- **Suggestions** are specific second-person cues: *"Your left knee is caving inward — press it out over your pinky toe."*
- **Risk score** is blended: 60% AI vision score + 40% local geometry score
- **Cooldown** is generated by GPT-4o-mini after the main session ends
- **TTS** reads the top suggestion aloud (OpenAI `tts-1`, alloy voice)

Without an API key, local geometry scoring still provides risk feedback and canned coaching suggestions rotate every 10 seconds.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Yes | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase messaging sender |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | No | Google Analytics measurement ID |
| `VITE_OPENAI_API_KEY` | No | Default OpenAI key (users can override in Profile) |

---

## Key Keyboard Shortcuts (Workout Page)

| Key | Action |
|---|---|
| `S` or `Space` | Mark end of current set (main phase only) |

---

## Scripts

```bash
npm run dev        # Start dev server (Vite HMR)
npm run build      # Type-check + production build
npm run lint       # ESLint
npm run preview    # Preview production build locally
```
