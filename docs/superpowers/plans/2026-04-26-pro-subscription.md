# Pro Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a $15/month Lemon Squeezy subscription that proxies AI calls through Vercel backend routes, caps monthly OpenAI spend at $8.50/user, and shows a progress bar (no dollar amounts) in ProfilePage.

**Architecture:** Lemon Squeezy checkout → webhook writes Firestore subscription doc → frontend reads it at login → AI calls route to Vercel proxy for subscribers (using server OPENAI_API_KEY) or to OpenAI directly for users with their own key. Token cost is tracked per user per month in Firestore and gated at $8.50.

**Tech Stack:** Lemon Squeezy REST API, Vercel Serverless Functions (`@vercel/node`), Firebase Admin SDK (`firebase-admin`), OpenAI SDK, React 19 + TypeScript.

---

## File Map

| File | Change |
|---|---|
| `api/lib/adminFirestore.ts` | New — Firebase Admin SDK init (shared by all API routes) |
| `api/lib/subscriptionGate.ts` | New — verify ID token + subscription check + usage tracking |
| `api/ls-webhook.ts` | New — handle LS subscription events |
| `api/ls-checkout.ts` | New — create LS checkout URL |
| `api/subscription-status.ts` | New — return subscription status + usagePct |
| `api/analyze.ts` | Modify — add subscription gate + token tracking |
| `api/cooldown.ts` | Modify — add subscription gate + token tracking |
| `api/recovery-insight.ts` | Modify — add subscription gate + token tracking |
| `firestore.rules` | Modify — add subscription + usage read rules |
| `src/lib/subscriptionStatus.ts` | New — frontend subscription state cache |
| `src/lib/formAnalysis.ts` | Modify — route pro calls through Vercel proxy |
| `src/pages/ProfilePage.tsx` | Modify — subscription panel UI |
| `src/App.tsx` | Modify — seed subscription status on auth state change |

---

## Task 1: Install dependencies + Firebase Admin shared init

**Files:**
- Modify: `package.json`
- Create: `api/lib/adminFirestore.ts`

- [ ] **Step 1: Install firebase-admin**

```bash
npm install firebase-admin
```

Expected: `added X packages` with no errors.

- [ ] **Step 2: Create `api/lib/adminFirestore.ts`**

```ts
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
  })
}

export const adminAuth = getAuth()
export const adminDb   = getFirestore()
export { FieldValue }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json api/lib/adminFirestore.ts
git commit -m "feat: add Firebase Admin SDK shared init for API routes"
```

---

## Task 2: Shared subscription gate + usage tracking middleware

**Files:**
- Create: `api/lib/subscriptionGate.ts`

This module is imported by all three AI proxy routes. It verifies the Firebase ID token, checks the subscription is active, checks the monthly spend cap, and provides a function to atomically increment spend after a call.

- [ ] **Step 1: Create `api/lib/subscriptionGate.ts`**

```ts
import { adminAuth, adminDb, FieldValue } from './adminFirestore'

export const CAP_USD = 8.50

const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gpt-4o':      { input: 5.00 / 1_000_000, output: 15.00 / 1_000_000 },
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING['gpt-4o-mini']
  return p.input * inputTokens + p.output * outputTokens
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

export type GateResult =
  | { uid: string; error: null }
  | { uid: null; error: { status: number; message: string } }

export async function verifyAndGate(authHeader: string | undefined): Promise<GateResult> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { uid: null, error: { status: 401, message: 'Missing Authorization header' } }
  }

  let uid: string
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    uid = decoded.uid
  } catch {
    return { uid: null, error: { status: 401, message: 'Invalid ID token' } }
  }

  const subSnap = await adminDb.doc(`users/${uid}/subscription`).get()
  if (subSnap.data()?.status !== 'active') {
    return { uid: null, error: { status: 403, message: 'No active subscription' } }
  }

  const month    = currentMonth()
  const usageSnap = await adminDb.doc(`users/${uid}/usage/${month}`).get()
  const spendUsd  = (usageSnap.data()?.spendUsd as number) ?? 0
  if (spendUsd >= CAP_USD) {
    return { uid: null, error: { status: 429, message: 'monthly_limit_reached' } }
  }

  return { uid, error: null }
}

export async function trackUsage(
  uid: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const cost  = calcCost(model, inputTokens, outputTokens)
  const month = currentMonth()
  await adminDb.doc(`users/${uid}/usage/${month}`).set(
    {
      spendUsd:   FieldValue.increment(cost),
      callCount:  FieldValue.increment(1),
      updatedAt:  FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/lib/subscriptionGate.ts
git commit -m "feat: add subscription gate + usage tracking middleware"
```

---

## Task 3: Lemon Squeezy webhook handler

**Files:**
- Create: `api/ls-webhook.ts`

- [ ] **Step 1: Create `api/ls-webhook.ts`**

```ts
import { createHmac, timingSafeEqual } from 'crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue, adminDb } from './lib/adminFirestore'

// Disable body parser so we can verify the raw body signature
export const config = { api: { bodyParser: false } }

async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LS_WEBHOOK_SECRET!
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody  = await readRawBody(req)
  const signature = req.headers['x-signature'] as string | undefined

  if (!signature || !verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const eventName = (event.meta as Record<string, unknown>)?.event_name as string
  const uid = (
    (event.meta as Record<string, unknown>)?.custom_data as Record<string, unknown>
  )?.uid as string | undefined

  if (!uid) return res.status(400).json({ error: 'Missing uid in custom_data' })

  const attrs = (
    (event.data as Record<string, unknown>)?.attributes as Record<string, unknown>
  ) ?? {}

  const lsSubscriptionId = String((event.data as Record<string, unknown>)?.id ?? '')
  const lsCustomerId     = String(attrs.customer_id ?? '')
  const renewsAt         = attrs.renews_at as string | null

  const statusMap: Record<string, string> = {
    subscription_created:   'active',
    subscription_updated:   'active',
    subscription_cancelled: 'cancelled',
    subscription_expired:   'expired',
  }

  const status = statusMap[eventName]
  if (!status) return res.status(200).json({ ignored: true })

  await adminDb.doc(`users/${uid}/subscription`).set(
    {
      status,
      lsSubscriptionId,
      lsCustomerId,
      currentPeriodEnd: renewsAt ? new Date(renewsAt) : FieldValue.delete(),
      updatedAt:        FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return res.status(200).json({ ok: true })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/ls-webhook.ts
git commit -m "feat: add Lemon Squeezy webhook handler"
```

---

## Task 4: Lemon Squeezy checkout URL endpoint

**Files:**
- Create: `api/ls-checkout.ts`

- [ ] **Step 1: Create `api/ls-checkout.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminAuth } from './lib/adminFirestore'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { uid, email } = req.body as { uid?: string; email?: string }
  if (!uid || !email) return res.status(400).json({ error: 'uid and email required' })

  // Verify the caller owns this uid
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    if (decoded.uid !== uid) return res.status(403).json({ error: 'Forbidden' })
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const appUrl = process.env.APP_URL ?? 'https://intoyourprime.vercel.app'

  const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept:        'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${process.env.LS_API_KEY}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email,
            custom: { uid },
          },
          product_options: {
            redirect_url: `${appUrl}/profile?pro=success`,
          },
        },
        relationships: {
          store:   { data: { type: 'stores',   id: process.env.LS_STORE_ID } },
          variant: { data: { type: 'variants', id: process.env.LS_VARIANT_ID } },
        },
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return res.status(502).json({ error: 'Checkout creation failed', detail: text })
  }

  const json = await response.json() as { data?: { attributes?: { url?: string } } }
  const checkoutUrl = json.data?.attributes?.url
  if (!checkoutUrl) return res.status(502).json({ error: 'No checkout URL returned' })

  return res.status(200).json({ checkoutUrl })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/ls-checkout.ts
git commit -m "feat: add Lemon Squeezy checkout URL endpoint"
```

---

## Task 5: Subscription status endpoint

**Files:**
- Create: `api/subscription-status.ts`

- [ ] **Step 1: Create `api/subscription-status.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminAuth, adminDb } from './lib/adminFirestore'
import { CAP_USD } from './lib/subscriptionGate'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const uid = req.query.uid as string | undefined
  if (!uid) return res.status(400).json({ error: 'uid required' })

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    if (decoded.uid !== uid) return res.status(403).json({ error: 'Forbidden' })
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const month = new Date().toISOString().slice(0, 7)

  const [subSnap, usageSnap] = await Promise.all([
    adminDb.doc(`users/${uid}/subscription`).get(),
    adminDb.doc(`users/${uid}/usage/${month}`).get(),
  ])

  const sub      = subSnap.data()
  const usage    = usageSnap.data()
  const spendUsd = (usage?.spendUsd as number) ?? 0
  const usagePct = Math.min(100, Math.round((spendUsd / CAP_USD) * 100))

  const periodEnd = sub?.currentPeriodEnd
  const currentPeriodEnd: string | null =
    periodEnd && typeof periodEnd.toDate === 'function'
      ? (periodEnd.toDate() as Date).toISOString()
      : typeof periodEnd === 'string'
      ? periodEnd
      : null

  return res.status(200).json({
    status:           (sub?.status as string) ?? 'none',
    currentPeriodEnd,
    usagePct,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/subscription-status.ts
git commit -m "feat: add subscription status endpoint"
```

---

## Task 6: Add subscription gate + token tracking to all three existing API routes

**Files:**
- Modify: `api/analyze.ts`
- Modify: `api/cooldown.ts`
- Modify: `api/recovery-insight.ts`

- [ ] **Step 1: Update `api/analyze.ts`**

Replace the entire file with:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { verifyAndGate, trackUsage } from './lib/subscriptionGate'

interface AnalyzeBody {
  frames:      string[]
  exercise:    string
  repCount:    number
  userProfile: { age: number; weight: number; fitnessLevel: string }
  phase:       'warmup' | 'main'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndGate(req.headers.authorization)
  if (gate.error) return res.status(gate.error.status).json({ error: gate.error.message })

  const { frames, exercise, repCount, userProfile, phase } = req.body as AnalyzeBody

  if (!frames?.length) return res.status(400).json({ error: 'frames required' })
  if (frames.length > 5) return res.status(400).json({ error: 'max 5 frames' })
  if (!exercise || repCount == null || !userProfile || !phase) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 10_000)

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model  = 'gpt-4o'

    const imageDetail = exercise.toLowerCase().trim() === 'pushup' ? 'high' : 'low'
    const imageBlocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] = frames.map(frame => ({
      type:      'image_url',
      image_url: { url: frame, detail: imageDetail },
    }))
    const textBlock: OpenAI.Chat.Completions.ChatCompletionContentPart = {
      type: 'text',
      text: `Exercise: ${exercise}. Phase: ${phase}. Client rep count: ${repCount}.\n` +
            `User: ${userProfile.age}yo, ${userProfile.weight}kg, fitness level: ${userProfile.fitnessLevel}.\n\n` +
            `Analyze form and respond with exactly this JSON:\n` +
            `{"riskScore":number,"suggestions":string[],"safetyConcerns":string[],"repCountEstimate":number,"dominantIssue":string|null,"warmupQuality":number|null}`,
    }

    const completion = await openai.chat.completions.create(
      { model, messages: [{ role: 'user', content: [...imageBlocks, textBlock] }] },
      { signal: controller.signal },
    )
    clearTimeout(timeout)

    const { prompt_tokens = 0, completion_tokens = 0 } = completion.usage ?? {}
    await trackUsage(gate.uid, model, prompt_tokens, completion_tokens)

    const raw    = completion.choices[0]?.message?.content ?? ''
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    return res.status(200).json(JSON.parse(cleaned))
  } catch (err) {
    clearTimeout(timeout)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
```

- [ ] **Step 2: Update `api/cooldown.ts`**

Replace the entire file with:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import type { Session, UserProfile } from '../src/types/index.js'
import { verifyAndGate, trackUsage } from './lib/subscriptionGate'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndGate(req.headers.authorization)
  if (gate.error) return res.status(gate.error.status).json({ error: gate.error.message })

  const { session, userProfile } = req.body as { session: Partial<Session>; userProfile: UserProfile }
  if (!session || !userProfile) return res.status(400).json({ error: 'Missing required fields' })

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 10_000)

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model  = 'gpt-4o-mini'

    const completion = await openai.chat.completions.create(
      {
        model,
        max_tokens: 600,
        messages: [
          { role: 'system', content: 'You are an expert personal trainer. Generate targeted cooldown exercises. Respond with valid JSON only.' },
          { role: 'user',   content: `Session: ${JSON.stringify(session)}\nUser: ${JSON.stringify(userProfile)}\n\nReturn JSON array of 4-6 cooldown exercises:\n[{"name":string,"durationSeconds":number,"targetMuscles":string[],"instruction":string}]` },
        ],
      },
      { signal: controller.signal },
    )
    clearTimeout(timeout)

    const { prompt_tokens = 0, completion_tokens = 0 } = completion.usage ?? {}
    await trackUsage(gate.uid, model, prompt_tokens, completion_tokens)

    const raw     = completion.choices[0]?.message?.content ?? ''
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    return res.status(200).json(JSON.parse(cleaned))
  } catch (err) {
    clearTimeout(timeout)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
```

- [ ] **Step 3: Update `api/recovery-insight.ts`**

Replace the entire file with:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import type { Session, DailyLog } from '../src/types/index.js'
import { verifyAndGate, trackUsage } from './lib/subscriptionGate'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndGate(req.headers.authorization)
  if (gate.error) return res.status(gate.error.status).json({ error: gate.error.message })

  const { sessions, logs } = req.body as { sessions: Session[]; logs: DailyLog[] }
  if (!sessions || !logs) return res.status(400).json({ error: 'Missing required fields' })

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 10_000)

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model  = 'gpt-4o-mini'

    const completion = await openai.chat.completions.create(
      {
        model,
        max_tokens: 200,
        messages: [
          { role: 'system', content: 'You are a sports recovery specialist. Return a 2-3 sentence plain-English insight. No JSON, just plain text.' },
          { role: 'user',   content: `Sessions: ${JSON.stringify(sessions)}\nLogs: ${JSON.stringify(logs)}` },
        ],
      },
      { signal: controller.signal },
    )
    clearTimeout(timeout)

    const { prompt_tokens = 0, completion_tokens = 0 } = completion.usage ?? {}
    await trackUsage(gate.uid, model, prompt_tokens, completion_tokens)

    return res.status(200).json({ insight: completion.choices[0]?.message?.content ?? '' })
  } catch (err) {
    clearTimeout(timeout)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add api/analyze.ts api/cooldown.ts api/recovery-insight.ts
git commit -m "feat: add subscription gate and token tracking to AI proxy routes"
```

---

## Task 7: Update Firestore rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add subscription and usage rules**

In `firestore.rules`, inside the `match /users/{uid}` block (after the existing `match /logs/{logId}` block), add:

```
      // Subscription — owner read only, backend writes via service account
      match /subscription {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow write: if false;
      }

      // Monthly usage — owner read only, backend writes via service account
      match /usage/{month} {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow write: if false;
      }
```

- [ ] **Step 2: Verify rules file is valid**

```bash
cat firestore.rules
```
Confirm the new blocks appear inside `match /users/{uid}` and are properly nested.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore rules for subscription and usage docs"
```

---

## Task 8: Frontend subscription status library

**Files:**
- Create: `src/lib/subscriptionStatus.ts`

- [ ] **Step 1: Create `src/lib/subscriptionStatus.ts`**

```ts
import { auth } from './firebase'

export type SubscriptionStatus = {
  status:           'active' | 'cancelled' | 'expired' | 'none'
  currentPeriodEnd: string | null
  usagePct:         number
}

let _cache: SubscriptionStatus | null = null

export async function loadSubscriptionStatus(): Promise<void> {
  const user = auth.currentUser
  if (!user) {
    _cache = { status: 'none', currentPeriodEnd: null, usagePct: 0 }
    return
  }
  try {
    const idToken = await user.getIdToken()
    const res     = await fetch(`/api/subscription-status?uid=${user.uid}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (res.ok) {
      _cache = (await res.json()) as SubscriptionStatus
    } else {
      _cache = { status: 'none', currentPeriodEnd: null, usagePct: 0 }
    }
  } catch {
    _cache = { status: 'none', currentPeriodEnd: null, usagePct: 0 }
  }
}

export function isProSubscriber(): boolean {
  return _cache?.status === 'active'
}

export function getSubscriptionCache(): SubscriptionStatus | null {
  return _cache
}

export function clearSubscriptionCache(): void {
  _cache = null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/subscriptionStatus.ts
git commit -m "feat: add frontend subscription status cache"
```

---

## Task 9: Route pro AI calls through Vercel proxy in formAnalysis.ts

**Files:**
- Modify: `src/lib/formAnalysis.ts`

The four exported functions (`analyzeForm`, `generateCooldown`, `generateRecoveryInsight`, `analyzeClip`) each need a pro-subscriber path that calls the Vercel route instead of OpenAI directly.

- [ ] **Step 1: Add import at top of `src/lib/formAnalysis.ts`**

After the existing imports, add:

```ts
import { isProSubscriber } from './subscriptionStatus'
import { auth } from './firebase'
```

- [ ] **Step 2: Add `getProToken` helper after the imports**

```ts
async function getProToken(): Promise<string> {
  return (await auth.currentUser?.getIdToken()) ?? ''
}
```

- [ ] **Step 3: Update `analyzeForm` to add pro path**

At the top of `analyzeForm`, before the existing `const c = client()` line, add:

```ts
  if (isProSubscriber()) {
    try {
      const token = await getProToken()
      const res   = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          frames:      params.frames,
          exercise:    params.exercise,
          repCount:    params.repCount ?? 0,
          userProfile: params.userProfile,
          phase:       params.phase,
        }),
      })
      if (res.status === 429) return { ...DEFAULT_FORM_RESULT, dominantIssue: '__monthly_limit__' }
      if (!res.ok) return { ...DEFAULT_FORM_RESULT }
      return (await res.json()) as FormAnalysisResult
    } catch {
      return { ...DEFAULT_FORM_RESULT }
    }
  }
```

- [ ] **Step 4: Update `generateCooldown` to add pro path**

At the top of `generateCooldown`, before `const c = client()`, add:

```ts
  if (isProSubscriber()) {
    try {
      const token = await getProToken()
      const res   = await fetch('/api/cooldown', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ session, userProfile }),
      })
      if (!res.ok) return []
      return (await res.json()) as CooldownExercise[]
    } catch {
      return []
    }
  }
```

- [ ] **Step 5: Update `generateRecoveryInsight` to add pro path**

At the top of `generateRecoveryInsight`, before `const c = client()`, add:

```ts
  if (isProSubscriber()) {
    try {
      const token = await getProToken()
      const res   = await fetch('/api/recovery-insight', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ sessions: context.sessions, logs: context.logs }),
      })
      if (!res.ok) return ''
      const json = (await res.json()) as { insight: string }
      return json.insight ?? ''
    } catch {
      return ''
    }
  }
```

- [ ] **Step 6: Update `analyzeClip` to add pro path**

At the top of `analyzeClip`, before `const c = client()`, add:

```ts
  if (isProSubscriber()) {
    try {
      const token = await getProToken()
      const res   = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          frames:      params.frames,
          exercise:    params.exercise,
          repCount:    0,
          userProfile: params.userProfile,
          phase:       'main' as const,
        }),
      })
      if (res.status === 429) return { ...DEFAULT_FORM_RESULT, dominantIssue: '__monthly_limit__' }
      if (!res.ok) return { ...DEFAULT_FORM_RESULT }
      const parsed = (await res.json()) as FormAnalysisResult & { notFitness?: boolean }
      if (parsed.notFitness) return { ...DEFAULT_FORM_RESULT, dominantIssue: '__not_fitness__' }
      return parsed
    } catch {
      return { ...DEFAULT_FORM_RESULT }
    }
  }
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/formAnalysis.ts
git commit -m "feat: route pro subscriber AI calls through Vercel proxy"
```

---

## Task 10: Subscription UI panel in ProfilePage

**Files:**
- Modify: `src/pages/ProfilePage.tsx`

Replace the existing "AI Settings" API key section with a three-state panel: (1) no sub + no key → show "Go Pro" CTA + "or use own key" below, (2) active subscriber → show progress bar + manage link, (3) own key → unchanged.

- [ ] **Step 1: Add subscription imports to ProfilePage.tsx**

At the top of `src/pages/ProfilePage.tsx`, after existing imports, add:

```ts
import { useEffect, useState } from 'react'  // already imported, just ensure useEffect is there
import {
  getSubscriptionCache,
  loadSubscriptionStatus,
  type SubscriptionStatus,
} from '../lib/subscriptionStatus'
```

- [ ] **Step 2: Add subscription state inside `ProfilePage` component**

After the existing `useState` declarations, add:

```ts
  const [sub, setSub] = useState<SubscriptionStatus | null>(getSubscriptionCache)
  const [checkingOut, setCheckingOut] = useState(false)
```

- [ ] **Step 3: Add useEffect to refresh subscription on mount**

```ts
  useEffect(() => {
    loadSubscriptionStatus().then(() => setSub(getSubscriptionCache()))
  }, [])
```

- [ ] **Step 4: Add `handleGoPro` function**

```ts
  const handleGoPro = async () => {
    const uid   = auth.currentUser?.uid
    const email = auth.currentUser?.email
    if (!uid || !email) return
    setCheckingOut(true)
    try {
      const token = await auth.currentUser!.getIdToken()
      const res   = await fetch('/api/ls-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ uid, email }),
      })
      if (!res.ok) { setCheckingOut(false); return }
      const { checkoutUrl } = (await res.json()) as { checkoutUrl: string }
      window.location.href = checkoutUrl
    } catch {
      setCheckingOut(false)
    }
  }
```

- [ ] **Step 5: Replace the AI Settings card JSX**

Find the entire `{/* ── AI / API key ──── */}` card div and replace it with:

```tsx
        {/* ── AI Settings ─────────────────────────────────────────────── */}
        <div className="card-surface p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-gray-500 uppercase">
              AI Settings
            </p>
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
              style={
                sub?.status === 'active'
                  ? { background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)' }
                  : keyHasValue
                  ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                  : { background: 'rgba(107,114,128,0.12)', color: '#6b7280' }
              }
            >
              {sub?.status === 'active' ? 'Pro ✓' : keyHasValue ? 'AI enabled' : 'No plan'}
            </span>
          </div>

          {/* ── Active subscriber ── */}
          {sub?.status === 'active' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em]">
                    Monthly usage
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {sub.currentPeriodEnd
                      ? `Resets ${new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      : ''}
                  </p>
                </div>
                {/* Progress bar */}
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: 'var(--border-2)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${sub.usagePct}%`,
                      background:
                        sub.usagePct >= 90
                          ? '#ef4444'
                          : sub.usagePct >= 70
                          ? '#f59e0b'
                          : 'var(--accent)',
                    }}
                  />
                </div>
                <p className="text-[10px] text-gray-600 mt-1">{sub.usagePct}% used</p>
              </div>
              <a
                href="https://app.lemonsqueezy.com/my-orders"
                target="_blank"
                rel="noreferrer"
                className="block text-center py-2.5 rounded-xl text-[13px] font-semibold text-gray-400 hover:text-white transition-colors"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                Manage subscription ↗
              </a>
            </div>
          )}

          {/* ── No sub, no key — show Go Pro CTA ── */}
          {sub?.status !== 'active' && !keyHasValue && (
            <div className="space-y-4">
              <div
                className="rounded-xl p-4 space-y-2"
                style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}
              >
                <p className="text-[14px] font-black text-white">✨ Go Pro — $15 / month</p>
                <p className="text-[12px] text-gray-400 leading-relaxed">
                  Full AI coaching, injury risk scoring, personalized cooldowns — no API key needed.
                </p>
                <button
                  type="button"
                  onClick={handleGoPro}
                  disabled={checkingOut}
                  className="w-full py-3 rounded-xl font-bold text-[13px] text-white transition-colors bg-accent hover:bg-accent/90 disabled:opacity-50 mt-1"
                >
                  {checkingOut ? 'Redirecting…' : 'Subscribe →'}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>
              <p className="text-[12px] text-gray-500">Use your own OpenAI key:</p>
              {/* existing key input below */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em]">
                    Add Key
                  </label>
                  <button type="button" onClick={() => setShowKey(v => !v)}
                    className="text-[11px] text-accent hover:text-accent/80 transition-colors">
                    {showKey ? 'hide' : 'show'}
                  </button>
                </div>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-proj-…"
                  className="input-dark font-mono text-[13px]"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button type="button" onClick={handleSaveKey} disabled={!apiKey.trim()}
                className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm text-white transition-colors">
                Save Key
              </button>
            </div>
          )}

          {/* ── Has own key (no sub) ── */}
          {sub?.status !== 'active' && keyHasValue && (
            <div className="space-y-4">
              <p className="text-[12px] text-gray-500 leading-relaxed">
                OpenAI key saved. Using GPT-4o-mini for form coaching, injury risk, and personalized cooldowns.
              </p>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em]">
                    Replace Key
                  </label>
                  <button type="button" onClick={() => setShowKey(v => !v)}
                    className="text-[11px] text-accent hover:text-accent/80 transition-colors">
                    {showKey ? 'hide' : 'show'}
                  </button>
                </div>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-proj-…"
                  className="input-dark font-mono text-[13px]"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={handleSaveKey} disabled={!apiKey.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm text-white transition-colors">
                  {keySaved ? 'Saved!' : 'Save Key'}
                </button>
                <button type="button" onClick={handleRemoveKey}
                  className="px-4 py-2.5 rounded-xl border border-red-900/50 text-red-400 hover:border-red-700 hover:text-red-300 font-semibold text-sm transition-colors">
                  Remove
                </button>
              </div>
              <div
                className="rounded-xl p-4 space-y-2"
                style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}
              >
                <p className="text-[12px] font-semibold text-white">Switch to Pro?</p>
                <p className="text-[11px] text-gray-500">$15/month — no key management, $8.50/mo AI budget included.</p>
                <button type="button" onClick={handleGoPro} disabled={checkingOut}
                  className="w-full py-2.5 rounded-xl font-bold text-[13px] text-white transition-colors bg-accent hover:bg-accent/90 disabled:opacity-50">
                  {checkingOut ? 'Redirecting…' : 'Upgrade to Pro →'}
                </button>
              </div>
              <p className="text-[11px] text-gray-700 leading-relaxed">
                Your key is stored only in this browser (localStorage) and sent directly to OpenAI. Never stored on any server.
              </p>
            </div>
          )}
        </div>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Build check**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✓ built in ...ms`

- [ ] **Step 8: Handle `?pro=success` query param — show a success toast**

At the top of `ProfilePage`, add a `useEffect` that fires once on mount to detect `?pro=success` in the URL and refresh subscription status:

```ts
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('pro') === 'success') {
      // Refresh subscription — webhook may take a few seconds
      const poll = setInterval(async () => {
        await loadSubscriptionStatus()
        const fresh = getSubscriptionCache()
        if (fresh?.status === 'active') {
          setSub(fresh)
          clearInterval(poll)
          // Clean up URL
          window.history.replaceState({}, '', '/profile')
        }
      }, 2000)
      // Stop polling after 30s regardless
      setTimeout(() => clearInterval(poll), 30_000)
    }
  }, [])
```

- [ ] **Step 9: Commit**

```bash
git add src/pages/ProfilePage.tsx
git commit -m "feat: add Pro subscription UI panel to ProfilePage"
```

---

## Task 11: Seed subscription status on login in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add import to App.tsx**

After existing imports, add:

```ts
import { loadSubscriptionStatus, clearSubscriptionCache } from './lib/subscriptionStatus'
```

- [ ] **Step 2: Update the onAuthStateChanged handler**

Find the existing `onAuthStateChanged` handler in `App.tsx` and update it to load subscription status when a user signs in and clear it on sign-out:

```ts
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        clearSubscriptionCache()
        return
      }
      // Sync profile name
      const profile = JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>
      const name = (typeof profile.name === 'string' && profile.name.trim())
        ? profile.name.trim()
        : user.displayName ?? user.email ?? ''
      if (name) {
        upsertUserDisplayName(user.uid, name, user.email ?? '').catch(() => {})
      }
      // Seed subscription status so AI routing decisions are correct before any call fires
      loadSubscriptionStatus().catch(() => {})
    })
    return unsub
  }, [])
```

- [ ] **Step 3: Verify TypeScript compiles and build passes**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -4
```
Expected: no errors, `✓ built in ...ms`

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: seed subscription status on auth state change"
```

---

## Vercel Environment Variables Checklist

Before deploying, add these in the Vercel dashboard under Project → Settings → Environment Variables:

| Variable | Where to get it |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Project Settings → Service accounts → Generate new private key → paste entire JSON as a single-line string |
| `LS_API_KEY` | Lemon Squeezy Dashboard → Settings → API |
| `LS_WEBHOOK_SECRET` | Lemon Squeezy Dashboard → Settings → Webhooks → your webhook → Signing secret |
| `LS_STORE_ID` | Lemon Squeezy Dashboard → Settings → Stores → your store ID (numeric) |
| `LS_VARIANT_ID` | LS Dashboard → Products → your product → Variants → variant ID (numeric) |
| `APP_URL` | Your Vercel deployment URL, e.g. `https://intoyourprime.vercel.app` |
| `OPENAI_API_KEY` | platform.openai.com → API keys |
