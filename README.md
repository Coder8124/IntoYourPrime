# IntoYourPrime — Your Personal AI Workout Guide

## What IYP Does

IYP uses your device camera and MediaPipe pose estimation to track your body in real time, then sends the best frames to GPT-4o Vision for instant form analysis and injury-risk scoring. It coaches you through warmup, main workout, and cooldown phases — giving you rep counts, safety alerts, and personalized recovery insights powered by Claude — all without any wearables or equipment.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Pose estimation | MediaPipe Pose (browser, npm) |
| Form analysis | OpenAI GPT-4o Vision |
| Coaching & recovery | Anthropic Claude (Haiku) |
| Voice feedback | Moonshine TTS *(planned)* |
| Auth & database | Firebase Auth + Firestore |
| Deployment | Vercel |

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in your keys
cp .env.example .env
# Edit .env — add VITE_OPENAI_API_KEY and VITE_ANTHROPIC_API_KEY

# 3. Start dev server
npm run dev
# Open http://localhost:5173
```

> **Note:** Camera access requires HTTPS or `localhost`. The OpenAI and Anthropic keys run client-side — restrict key usage in your provider dashboards for production.

## Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_OPENAI_API_KEY` | GPT-4o Vision — live form analysis |
| `VITE_ANTHROPIC_API_KEY` | Claude Haiku — cooldown plans & recovery insights |
| `VITE_FIREBASE_*` | Firebase Auth + Firestore (social features) |

## Demo Mode — Testing with Your Own Workout Video

To test the vision pipeline with a pre-recorded workout clip instead of a live camera:

1. Extract frames from your video:
   ```bash
   ffmpeg -i workout.mp4 -vf fps=1 frame%03d.jpg
   ```
2. Run the app (`npm run dev`) and navigate to **`/pipeline-test`**
3. Upload up to 5 frames using the file picker, choose your exercise type
4. Click **Run analyze** — the full AI response JSON is shown inline

This works without any backend — API calls go directly to OpenAI from the browser.

## App Routes

| Route | Page |
|---|---|
| `/` | Redirects to `/onboarding` or `/home` |
| `/onboarding` | Profile setup (name, age, weight, height) |
| `/home` | Hub — start workout or test the pipeline |
| `/workout` | Live camera session with pose tracking |
| `/session-summary` | Post-workout rep counts and risk stats |
| `/recovery` | Daily recovery log |
| `/profile` | User profile *(coming soon)* |
| `/friends` | Friend streaks *(coming soon)* |

## Build & Deploy

```bash
npm run build   # TypeScript check + Vite production bundle → dist/
```

Deploy to Vercel: push to main — Vercel auto-deploys. Add env vars in the Vercel project dashboard under **Settings → Environment Variables**.

## Team

| Name | Role |
|---|---|
| Vishwesh | Pose detection, rep counter, AI integration |
| *(teammate)* | *(role)* |
| *(teammate)* | *(role)* |

**Hackathon:** *(Hackathon name — April 2026)*
