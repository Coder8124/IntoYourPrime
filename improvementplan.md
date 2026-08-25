# IntoYourPrime — Improvement Roadmap

## Core Objective

Transform IntoYourPrime from:

> **An AI-powered fitness app with computer vision features**

into:

> **A movement-intelligence platform that can reliably understand, measure, and learn from human exercise through ordinary cameras.**

The guiding principle:

**Build the movement engine first. Make the AI layer consume its outputs rather than define them.**

---

# Phase 0 — Establish the Baseline

### Goal

Before changing the system, determine exactly how well it currently works.

### Tasks

* [ ] Create a fixed set of test videos for every supported exercise.
* [ ] Record multiple people performing each exercise.
* [ ] Include good and deliberately bad repetitions.
* [ ] Test different camera distances.
* [ ] Test different lighting conditions.
* [ ] Test different clothing/body proportions.
* [ ] Test front and side camera orientations where applicable.
* [ ] Record current rep-counting accuracy.
* [ ] Record false-positive rep counts.
* [ ] Record missed reps.
* [ ] Record latency and FPS.
* [ ] Record API latency/cost for GPT-based features.

### Deliverable

Create:

```text
docs/evaluation.md
```

containing the baseline metrics.

**Do not optimize before you have numbers.**

---

# Phase 1 — Refactor Around Movement

## Goal

Make movement the fundamental abstraction of the application.

Currently, the repo is organized heavily around pages, hooks, and feature utilities, while `useRepCounter.ts` contains exercise-specific movement logic.

Create a proper movement pipeline:

```text
Camera
   ↓
Pose Estimation
   ↓
Pose Frame
   ↓
Movement State
   ↓
Rep Segmentation
   ↓
Rep Metrics
   ↓
Set Metrics
   ↓
Workout Metrics
   ↓
Coaching
```

### New conceptual objects

```text
PoseFrame
MovementState
Rep
RepPhase
Set
ExerciseObservation
FormObservation
MovementEvent
WorkoutSession
```

### A Rep should contain

```text
repId
startTime
endTime

eccentricDuration
concentricDuration
bottomDuration

rangeOfMotion
tempo
velocity

leftRightSymmetry
stability

jointAngles
landmarkConfidence

formObservations[]
```

### Deliverable

The application should be able to represent an individual repetition as structured data.

---

# Phase 2 — Build a Real Exercise Engine

## Goal

Replace ad-hoc exercise logic with reusable movement primitives.

The current system uses different simple signals for each exercise—for example hip Y position for squats/deadlifts, wrist Y for shoulder press, and joint angles for curls.

That's fine for V0.

Now generalize it.

### Build primitives

```text
Angle()
Distance()
Velocity()
Acceleration()
RelativePosition()
JointAlignment()
RangeOfMotion()
Symmetry()
PhaseTransition()
```

Then exercises become compositions of primitives.

Example:

```text
Squat
 ├── hip descent
 ├── knee flexion
 ├── ankle relationship
 ├── bottom detection
 ├── ascent
 └── lockout
```

rather than:

```text
if hipY > threshold
    state = DOWN
```

### Add exercise state machines

```text
IDLE
 ↓
SETUP
 ↓
ECCENTRIC
 ↓
BOTTOM
 ↓
CONCENTRIC
 ↓
LOCKOUT
 ↓
REP_COMPLETE
```

This should dramatically improve robustness.

---

# Phase 3 — Make Rep Counting Extremely Good

## Goal

Rep counting becomes a solved problem before adding more AI.

### Improve

* [ ] Adaptive thresholds
* [ ] Per-user calibration
* [ ] Landmark confidence weighting
* [ ] Velocity-based phase detection
* [ ] Hysteresis
* [ ] Dynamic debounce
* [ ] Occlusion handling
* [ ] Camera-distance normalization
* [ ] Partial-rep detection
* [ ] Failed-rep detection
* [ ] Rep confidence score

Instead of:

```text
Rep: 12
```

produce:

```text
Rep 12
Confidence: 97%

ROM: 84%
Tempo: 2.1s
Depth: 91%
Stability: 87%
```

---

# Phase 4 — Build the Movement Analytics Layer

This is where IntoYourPrime starts becoming genuinely interesting.

## Track every repetition

For each rep:

```text
ROM
tempo
velocity
acceleration
symmetry
stability
joint angles
phase durations
form deviations
confidence
```

Then calculate:

```text
Set average
Set variance
Fatigue trend
Technique trend
ROM trend
Velocity trend
```

### Example

Instead of:

> "You completed 10 squats."

show:

> "Your squat depth stayed consistent, but concentric velocity decreased 14% over the final three reps."

That is **movement intelligence**.

---

# Phase 5 — Replace "Injury Risk" With Movement Quality

## Important

Do not pretend the current risk score is a medically validated injury predictor.

The current implementation blends a local geometry score with an OpenAI vision score at 60/40.

Rename the concept.

### Replace

```text
Injury Risk: 72
```

with something like:

```text
Movement Quality: 72
```

or:

```text
Form Deviation: Moderate
```

### Build a transparent scoring system

```text
Movement Quality
 ├── ROM
 ├── symmetry
 ├── stability
 ├── alignment
 ├── tempo
 └── consistency
```

Every score should be explainable.

Example:

```text
Movement Quality: 78

+ ROM           91
+ Stability     84
+ Symmetry      88
- Knee tracking 61
- Tempo         72
```

Now the score has an engineering basis.

---

# Phase 6 — Build the Replay System

This should be a major milestone.

## Goal

Separate the movement engine from the webcam.

Create:

```text
Live Input
    ↓
Pose Recorder
    ↓
Pose Dataset
    ↓
Replay Engine
```

A recorded workout should be replayable through any future version of the movement engine.

### Example

```text
Workout #104

Engine v0.1 → 42 reps
Engine v0.2 → 40 reps
Engine v0.3 → 41 reps
```

This allows regression testing.

### Deliverables

```text
datasets/
replays/
tests/movement/
```

Eventually:

```text
npm run evaluate
```

should run the entire movement benchmark.

---

# Phase 7 — Build Your Own Evaluation Dataset

This is potentially the biggest long-term asset.

Create a dataset containing:

```text
Person
Exercise
Camera angle
Lighting
Pose sequence
Rep boundaries
Rep quality
Form deviations
```

Start small.

For example:

```text
10 people
7 exercises
20 sets/person
```

Then expand.

### Annotate

```text
rep_start
rep_end
phase
ROM
good_form
bad_form
deviation_type
severity
```

Now you can quantitatively compare algorithms.

---

# Phase 8 — Introduce Learned Models

Only after the deterministic system works.

Do **not** immediately replace everything with an end-to-end neural network.

Instead:

```text
Pose
 ↓
Engineered features
 ↓
Small ML models
```

Examples:

### Model 1

Rep phase classifier.

### Model 2

Rep quality classifier.

### Model 3

Form deviation classifier.

### Model 4

Exercise classifier.

### Model 5

Fatigue estimator.

This gives you a gradual transition:

```text
Rules
 ↓
Rules + ML
 ↓
Learned movement models
```

---

# Phase 9 — Demote the LLM to the Coach

GPT should consume structured movement information.

Instead of sending raw frames and asking:

> "How is my form?"

give it:

```text
Exercise: Squat

Rep 1:
ROM 89%
Tempo 2.1s
Knee deviation 3°

Rep 2:
ROM 87%
Tempo 2.0s
Knee deviation 5°

Rep 3:
ROM 83%
Tempo 1.7s
Knee deviation 8°
```

Then ask the model:

> Explain the observed trend to the user.

The LLM becomes:

**communication intelligence**, not **movement intelligence**.

This also makes the system more deterministic and much cheaper.

---

# Phase 10 — Build Longitudinal Intelligence

Once individual workouts are reliable, connect them.

Create a user movement profile:

```text
User
 ├── Strength
 ├── Mobility
 ├── Stability
 ├── ROM
 ├── Symmetry
 ├── Tempo
 ├── Technique
 └── Fatigue
```

Track trends across weeks/months.

The system should eventually answer:

> "Am I getting better?"

rather than simply:

> "Did I work out?"

---

# Phase 11 — Build Fatigue Detection

This is one of the most interesting potential features.

Detect degradation across reps:

```text
Velocity ↓
ROM ↓
Stability ↓
Symmetry ↓
Tempo variance ↑
```

Then infer:

```text
Technique degradation detected
```

The coach could say:

> "Your last four reps show declining velocity and depth. Consider ending the set."

This is much more compelling than generic motivational coaching.

---

# Phase 12 — Privacy / Local-First Architecture

Fitness video is sensitive.

Move toward:

```text
Camera
 ↓
Local pose estimation
 ↓
Local movement analysis
 ↓
Local storage
```

Cloud AI becomes optional.

### Desired architecture

```text
                 LOCAL
                   │
Camera → Pose → Movement Engine
                   │
             Workout Database
                   │
          ┌────────┴─────────┐
          │                  │
       Analytics         Optional AI
                              │
                           OpenAI
```

Raw video should not need to leave the user's machine.

---

# Phase 13 — Fix the Architecture

Gradually reorganize the codebase around domains.

Proposed structure:

```text
src/

  movement/
    pose/
    geometry/
    exercises/
    reps/
    phases/
    metrics/

  coaching/
    rules/
    feedback/
    llm/

  workouts/
    sessions/
    sets/
    history/

  recovery/
    sleep/
    soreness/
    fatigue/

  intelligence/
    profiles/
    trends/
    recommendations/

  social/
    friends/
    squads/
    leaderboards/

  infrastructure/
    firebase/
    openai/

  ui/
    components/
    pages/
```

The goal is that the movement engine can theoretically exist without React, Firebase, or OpenAI.

---

# Phase 14 — Rebuild the Product Around the Core

After the underlying system is good, simplify the UI.

The current project has a large number of product features—recovery logging, friend squads, Prime Intelligence, TTS, streaks, cooldown generation, etc.

Don't delete them permanently.

But stop adding more.

Prioritize:

```text
1. Start workout
2. Camera understands exercise
3. Reps are counted correctly
4. Form is measured
5. User gets immediate feedback
6. Session is analyzed
7. Progress is tracked
```

Everything else is secondary.

---

# Phase 15 — Rebuild Prime Intelligence

Don't make Prime Intelligence primarily a branded chatbot.

Make it the longitudinal intelligence layer.

It should understand:

```text
Current workout
        +
Historical workouts
        +
Movement profile
        +
Recovery
        +
Goals
        ↓
Personalized recommendation
```

For example:

> "Your squat depth has improved 8% over the last month, but your final-set velocity has consistently dropped. Consider reducing your working-set volume."

That is a meaningful AI system.

---

# Phase 16 — Social Features

Only after the core movement engine is strong.

Then use movement data for social features.

Instead of:

> "John has a 12-day streak."

you could have:

> "John improved his squat ROM by 11% this month."

or:

> "Your squad completed 412 quality reps this week."

Now the social layer is built around the unique asset of the product.

---

# Phase 17 — Benchmark Everything

Create a public technical benchmark.

Track:

### Computer Vision

* FPS
* latency
* landmark confidence

### Rep Detection

* precision
* recall
* F1
* missed reps
* false reps

### Form Detection

* precision
* recall
* confusion matrix

### System

* CPU
* memory
* network usage
* API cost
* battery impact

### User Experience

* feedback latency
* onboarding completion
* workout completion

---

# Phase 18 — Rewrite the README

The README should stop being primarily a feature list.

Structure it as:

```text
IntoYourPrime

1. What it is
2. The problem
3. Architecture
4. Movement engine
5. Computer vision pipeline
6. Evaluation
7. Benchmarks
8. AI architecture
9. Privacy
10. Demo
11. Limitations
12. Roadmap
13. Installation
```

Lead with the technical thesis.

Not:

> "GPT-4o analyzes your workout."

Instead:

> "IntoYourPrime converts ordinary webcam video into structured movement data in real time."

Then explain how.

---

# Recommended Priority

## 🔴 P0 — Do immediately

* [ ] Baseline evaluation — blocked on recorded test videos (Phase 0)
* [ ] Replay system
* [x] Movement data model — `src/lib/movement/rep.ts` (`Rep`, `SetMetrics`)
* [ ] Exercise state machines — deferred; the existing per-exercise signals were
  left in place rather than rewritten (see Phase 2)
* [x] Rep confidence — per-rep `confidence`, `landmarkConfidence`, `partial`
* [x] Better rep detection — calibrated range now decays, so a single outlier no
  longer compresses the signal for the rest of the set
* [x] Remove/reframe "injury risk" — replaced by Movement Quality
  (`src/lib/movement/quality.ts`), explainable per factor
* [ ] Separate movement engine from OpenAI — partial: the movement layer is pure
  and OpenAI is now one weighted factor among six rather than the score itself

## 🟠 P1 — Next

* [ ] Movement metrics
* [ ] Form-quality engine
* [ ] Dataset
* [ ] Automated evaluation
* [ ] Fatigue detection
* [ ] Longitudinal analytics

## 🟡 P2 — Then

* [ ] ML models
* [ ] Personalized movement profile
* [ ] Local-first architecture
* [ ] Better coaching
* [ ] LLM integration over structured data

## 🟢 P3 — Later

* [ ] Prime Intelligence
* [ ] Social systems
* [ ] Leaderboards
* [ ] TTS
* [ ] Streaks
* [ ] Gamification
* [ ] Advanced recovery features

---

# The End State

The architecture should eventually look like:

```text
                         INTOYOURPRIME
                              │
                         CAMERA INPUT
                              │
                              ▼
                       POSE ESTIMATION
                              │
                              ▼
                    MOVEMENT REPRESENTATION
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
             Exercise       Rep         Phase
             Detection    Detection    Detection
                 │            │            │
                 └────────────┼────────────┘
                              ▼
                      MOVEMENT ANALYTICS
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   Form Quality           Fatigue              Progress
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                     PERSONAL MOVEMENT MODEL
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
          Deterministic Coach          LLM Coach
                 │                         │
                 └────────────┬────────────┘
                              ▼
                           USER
```

## The ultimate thesis

The most important shift is this:

**Don't build an app that uses AI to give fitness advice.**

Build a system that **understands exercise**, and then put an AI coach on top of that system.

That gives you a much stronger technical project, a much stronger research direction, and eventually a much stronger product moat.
