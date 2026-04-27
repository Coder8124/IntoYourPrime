# Pro Subscription Implementation Plan

**Goal:** Add a $15/month "IntoYourPrime Pro" plan via Lemon Squeezy that proxies all AI calls through Vercel backend routes, caps monthly OpenAI spend at $8.50 per subscriber, and shows usage as a progress bar (no dollar amounts).

**Architecture:** Lemon Squeezy hosted checkout → webhook → Firestore subscription doc → frontend reads doc at load → AI calls routed to Vercel proxy routes for subscribers, or direct to OpenAI for users with their own key. Token spend tracked atomically in Firestore per user per billing month.

**Tech Stack:** Lemon Squeezy (payments), Vercel Serverless Functions (API routes), Firebase Firestore (subscription + usage state), Firebase Admin SDK (backend writes), OpenAI SDK (proxied calls).

---

## Environment Variables (Vercel)

| Variable | Description |
|---|---|
| `LS_API_KEY` | Lemon Squeezy API key |
| `LS_WEBHOOK_SECRET` | Lemon Squeezy webhook signing secret |
| `LS_STORE_ID` | LS store ID (numeric string) |
| `LS_VARIANT_ID` | LS product variant ID for the $15/month plan |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase service account JSON (stringified) |
| `OPENAI_API_KEY` | App's OpenAI key used for subscriber proxy calls |

---

## Firestore Schema

```
users/{uid}/
  subscription: {
    status:           'active' | 'cancelled' | 'expired' | 'none'
    lsSubscriptionId: string
    lsCustomerId:     string
    currentPeriodEnd: Timestamp
    updatedAt:        Timestamp
  }

  usage/{YYYY-MM}: {
    spendUsd:   number    // running total, compared against CAP_USD = 8.50
    callCount:  number
    updatedAt:  Timestamp
  }
```

**Firestore rules:** users can read their own `subscription` and `usage` docs. Only the Firebase service account (backend) can write them.

---

## OpenAI Pricing Constants (backend only)

```ts
const PRICING = {
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gpt-4o':      { input: 5.00 / 1_000_000, output: 15.00 / 1_000_000 },
  'tts-1':       { perChar: 15.00 / 1_000_000 },
}
const CAP_USD = 8.50
```

---

## Vercel API Routes

### `POST /api/ls-webhook`
- Verify HMAC-SHA256 signature from `X-Signature` header using `LS_WEBHOOK_SECRET`
- Return 401 if invalid
- Extract `uid` from `event.meta.custom_data.uid`
- Handle four event types:
  - `subscription_created` / `subscription_updated` → write `status`, `lsSubscriptionId`, `lsCustomerId`, `currentPeriodEnd`, `updatedAt` to `users/{uid}/subscription`
  - `subscription_cancelled` → write `status: 'cancelled'`
  - `subscription_expired` → write `status: 'expired'`
- Return 200 on success, 400 on missing uid

### `GET /api/subscription-status`
- Query param: `uid`
- Read `users/{uid}/subscription` and `users/{uid}/usage/{YYYY-MM}` from Firestore
- Return:
  ```json
  {
    "status": "active",
    "currentPeriodEnd": "2026-05-26T00:00:00Z",
    "usagePct": 42,
    "capUsd": 8.50
  }
  ```
- `usagePct` = `Math.round((spendUsd / CAP_USD) * 100)`, clamped 0–100
- Dollar amounts are never returned to the client

### `POST /api/ls-checkout`
- Body: `{ uid, email }`
- Call Lemon Squeezy API to create a checkout URL for `LS_VARIANT_ID`
- Embed `uid` in `custom_data`, prefill `email`
- Set `success_url` to `https://app.com/profile?pro=success`
- Return `{ checkoutUrl }` — frontend redirects to it
- Never exposes `LS_VARIANT_ID` or `LS_API_KEY` to the browser

### Existing routes — add token tracking middleware

Apply to `/api/analyze`, `/api/cooldown`, `/api/recovery-insight`:

1. Require `Authorization: Bearer <Firebase ID token>` header
2. Verify the ID token with Firebase Admin SDK → extract `uid`
3. Read `users/{uid}/subscription` — if not `active`, return 403
4. Read `users/{uid}/usage/{YYYY-MM}` — if `spendUsd >= CAP_USD`, return 429 `{ error: 'monthly_limit_reached' }`
5. Make the OpenAI call as normal
6. Calculate `callCost` from `response.usage.prompt_tokens`, `response.usage.completion_tokens`, and the model name using `PRICING` constants
7. Atomically increment `spendUsd` and `callCount` in Firestore using a transaction
8. Return the OpenAI response to the client

---

## Frontend Changes

### `src/lib/subscriptionStatus.ts` (new file)

```ts
export type SubscriptionStatus = {
  status: 'active' | 'cancelled' | 'expired' | 'none'
  currentPeriodEnd: string | null
  usagePct: number   // 0–100, never dollars
}

// Cached in memory for the session — only one fetch per load
let _cache: SubscriptionStatus | null = null

export async function getSubscriptionStatus(uid: string): Promise<SubscriptionStatus>
export function clearSubscriptionCache(): void
export function isProSubscriber(): boolean  // returns true if cached status === 'active'
```

### `src/lib/formAnalysis.ts`

`analyzeForm`, `generateCooldown`, `generateRecoveryInsight`, `analyzeClip` each check:

```ts
if (isProSubscriber()) {
  // call /api/analyze (etc.) with Authorization: Bearer <Firebase ID token>
} else if (hasApiKey()) {
  // call OpenAI directly from browser as now
} else {
  return DEFAULT_FORM_RESULT  // no key, no sub
}
```

Firebase ID token obtained via `await auth.currentUser?.getIdToken()`.

### `src/pages/ProfilePage.tsx`

Replace the API key section with a three-state panel:

**State 1 — No key, no subscription:**
```
┌─────────────────────────────────────┐
│  AI Settings              [ No plan ]│
│                                      │
│  ┌──────────────────────────────┐   │
│  │  ✨ Go Pro — $15 / month     │   │  ← bg-accent button
│  │  Unlimited AI coaching,      │   │
│  │  no API key needed           │   │
│  └──────────────────────────────┘   │
│                                      │
│  ─────────── or ───────────         │
│                                      │
│  Add your own OpenAI key below      │
│  [existing key input unchanged]     │
└─────────────────────────────────────┘
```

**State 2 — Active subscriber:**
```
┌─────────────────────────────────────┐
│  AI Settings           [ Pro ✓ ]    │
│                                      │
│  Monthly usage                       │
│  ████████░░░░░░░░░░░░  42%          │  ← progress bar, no $
│  Resets Apr 26                      │
│                                      │
│  [ Manage subscription ↗ ]          │  ← LS customer portal link
└─────────────────────────────────────┘
```

Progress bar color: green 0–70%, amber 70–90%, red 90–100%.

**State 3 — Own API key (unchanged):** existing UI, no changes.

### `src/App.tsx`

On auth state change (user signs in), call `getSubscriptionStatus(uid)` and cache result. This ensures `isProSubscriber()` is accurate before any AI call fires.

---

## Lemon Squeezy Dashboard Setup (one-time manual steps)

1. Create product: "IntoYourPrime Pro", $15/month recurring
2. Add custom checkout field: key `uid`, hidden, required
3. Set webhook URL: `https://<your-domain>/api/ls-webhook`
4. Enable events: `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`
5. Copy signing secret → `LS_WEBHOOK_SECRET` in Vercel env
6. Copy API key → `LS_API_KEY`
7. Copy store ID and variant ID → `LS_STORE_ID`, `LS_VARIANT_ID`

---

## Error States

| Scenario | User-facing message |
|---|---|
| `monthly_limit_reached` (429) | "You've used all your AI credits for this month. Resets on [date]." |
| Subscription expired/cancelled | "Your Pro plan has ended. Renew in Profile → AI Settings." |
| No subscription, no key | "Add an OpenAI key or upgrade to Pro in Profile." |
| Webhook signature invalid | Silent 401 (no user impact) |
