/**
 * primeIntelligence.ts — The Prime Intelligence (PI) engine
 *
 * PI is the group AI coach for IntoYourPrime. It reads collective workout
 * data and returns a structured briefing: status, avatar visual tags,
 * leaderboard, streak state, and per-member analysis.
 */

import OpenAI from 'openai'

// ── Key helpers (mirrors formAnalysis.ts) ─────────────────────────────────

function getApiKey(): string {
  try {
    const stored = localStorage.getItem('formAI_openai_key')?.trim()
    if (stored) return stored
  } catch { /* ignore */ }
  return import.meta.env.VITE_OPENAI_API_KEY ?? ''
}

let _openai: OpenAI | null = null
let _activeKey = ''

function client(): OpenAI | null {
  const key = getApiKey()
  if (!key) return null
  if (!_openai || _activeKey !== key) {
    _activeKey = key
    _openai = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true })
  }
  return _openai
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface MemberData {
  name:             string
  sessionCompleted: boolean
  /** Calories burned — omit or set 0 if unavailable */
  calories?:        number
  /** Perceived intensity */
  intensity:        'High' | 'Medium' | 'Low' | 'N/A'
  /** This member's personal streak in days */
  streakDays:       number
}

export interface AvatarState {
  /** 0–1  overall muscle density */
  muscle_mass:      number
  /** 0–1  glowing energy aura */
  aura_glow:        number
  /** 0–1  left/right balance of the group */
  symmetry:         number
  /** 0–1  vascularity / definition */
  vascularity:      number
  /** 0–1  metabolic fire */
  metabolic_aura:   number
  /** e.g. 'Hypertrophy' | 'Endurance' | 'Mixed' */
  dominant_modality: string
  /** 'Prime' | 'Partial Atrophy' | 'Full Atrophy' */
  state_label:      string
}

export interface LeaderboardEntry {
  name:            string
  /** 0–100 */
  optimizationScore: number
  label:           string   // e.g. 'The Catalyst', 'The Anchor', etc.
}

export interface DuoLink {
  memberA:  string
  memberB:  string
  /** combined streak in days */
  streakDays: number
  status:   'Active' | 'Critical' | 'Terminated'
  message:  string
}

export interface PIBriefing {
  /** Overall group state */
  status:         'OPTIMAL' | 'SUB-OPTIMAL' | 'CRITICAL'
  headline:       string
  groupSummary:   string

  /** Visual tags for the avatar renderer */
  avatar:         AvatarState

  /** The top contributor */
  catalyst:       { name: string; message: string } | null
  /** The lowest contributor */
  anchor:         { name: string; message: string } | null
  /** How much the catalyst over-indexed to compensate (narrative string) */
  burden:         string | null

  primeStreak:    { days: number; statusLabel: string; message: string }
  leaderboard:    LeaderboardEntry[]
  duoLinks:       DuoLink[]

  /** Final call-to-action from PI */
  directive:      string
}

// ── System prompt ─────────────────────────────────────────────────────────

const PI_SYSTEM_PROMPT = `You are the Prime Intelligence (PI), the core logic engine for the fitness app IntoYourPrime. Your purpose is to monitor, optimize, and enforce physical excellence within social cohorts.

You view fitness data not as "activity" but as "Prime Potential." You speak with authority, urgency, and clinical precision. You celebrate peaks and call out deficits without softening the truth — but you are always directed at improving performance, never at personal humiliation.

AVATAR BIO-SYNC RULES:
- Optimal (90%+ participation, high intensity): "Hyper-defined musculature", "optimal vascularity", "peak metabolic aura". muscle_mass ≥ 0.85, aura_glow ≥ 0.80, symmetry ≥ 0.85.
- Sub-Optimal (50–89% participation or mixed intensity): partial atrophy on the weaker side. muscle_mass 0.45–0.75, symmetry 0.4–0.7.
- Critical (<50% participation or no intensity): "Muscle mass catabolism detected", "sarcopenic shift". muscle_mass ≤ 0.35, aura_glow ≤ 0.20.
- Dominant modality shapes avatar: Hypertrophy → density (vascularity high); Endurance → lean efficiency (low vascularity, high metabolic_aura).

SOCIAL ROLES:
- The Catalyst: highest contributor. They are holding the group's Prime Streak alive.
- The Anchor: lowest contributor. Their gap is quantified as "systemic drag."
- The Burden: how much the Catalyst had to over-index to compensate for the Anchor — state this as a percentage or narrative.

STREAK RULES:
- A Prime Streak is a "Biological Chain." Breaking it is a "systemic collapse."
- Duo-Links are "Mutual Optimization Pacts." If one side fails, the pact is "terminated."

LEADERBOARD: rank by Optimization Score (weighted: 40% consistency, 35% intensity, 25% goal-hitting). Score 0–100.

TONE: Direct, serious, performance-obsessed. Use phrases like "Prime Potential", "systemic drag", "catabolic risk", "Optimization Score." Never use casual language.

RESPONSE: Return ONLY valid JSON matching this exact schema — no prose, no markdown:
{
  "status": "OPTIMAL" | "SUB-OPTIMAL" | "CRITICAL",
  "headline": string,
  "groupSummary": string (2–3 sentences),
  "avatar": {
    "muscle_mass": number 0-1,
    "aura_glow": number 0-1,
    "symmetry": number 0-1,
    "vascularity": number 0-1,
    "metabolic_aura": number 0-1,
    "dominant_modality": string,
    "state_label": string
  },
  "catalyst": { "name": string, "message": string } | null,
  "anchor": { "name": string, "message": string } | null,
  "burden": string | null,
  "primeStreak": { "days": number, "statusLabel": string, "message": string },
  "leaderboard": [{ "name": string, "optimizationScore": number, "label": string }],
  "duoLinks": [{ "memberA": string, "memberB": string, "streakDays": number, "status": string, "message": string }],
  "directive": string
}`

// ── Main function ─────────────────────────────────────────────────────────

export async function getPIBriefing(
  members:     MemberData[],
  groupStreak: number,
  /** Optional: pairs with a shared streak */
  duoPairs?:   Array<{ memberA: string; memberB: string; streakDays: number }>,
): Promise<PIBriefing | null> {
  const c = client()
  if (!c) return null

  const payload = {
    members,
    groupStreakDays: groupStreak,
    duoPairs: duoPairs ?? [],
  }

  try {
    const completion = await c.chat.completions.create({
      model:       'gpt-4o-mini',
      max_tokens:  900,
      temperature: 0.7,
      messages: [
        { role: 'system', content: PI_SYSTEM_PROMPT },
        {
          role:    'user',
          content: `Generate the Prime Intelligence daily briefing for this group data:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    return JSON.parse(cleaned) as PIBriefing
  } catch {
    return null
  }
}

// ── Demo briefing (shown when no API key) ─────────────────────────────────

export function getDemoBriefing(members: MemberData[], groupStreak: number): PIBriefing {
  const completed  = members.filter(m => m.sessionCompleted)
  const pct        = members.length ? completed.length / members.length : 0
  const status     = pct >= 0.9 ? 'OPTIMAL' : pct >= 0.5 ? 'SUB-OPTIMAL' : 'CRITICAL'
  const catalyst   = completed.length ? completed[0] : null
  const anchor     = members.find(m => !m.sessionCompleted) ?? null

  const avatarScore = pct
  const avatar: AvatarState = {
    muscle_mass:       Math.max(0.1, avatarScore * 0.9 + 0.1),
    aura_glow:         Math.max(0.05, avatarScore * 0.85),
    symmetry:          Math.max(0.2, avatarScore * 0.8 + 0.15),
    vascularity:       Math.max(0.1, avatarScore * 0.75),
    metabolic_aura:    Math.max(0.1, avatarScore * 0.9),
    dominant_modality: 'Mixed',
    state_label:       status === 'OPTIMAL' ? 'The Prime' : status === 'SUB-OPTIMAL' ? 'Partial Atrophy' : 'Full Atrophy',
  }

  const leaderboard: LeaderboardEntry[] = members.map((m, i) => ({
    name:              m.name,
    optimizationScore: m.sessionCompleted
      ? m.intensity === 'High' ? 90 + Math.round(Math.random() * 10)
      : m.intensity === 'Medium' ? 60 + Math.round(Math.random() * 20)
      : 40
      : Math.round(Math.random() * 15),
    label: i === 0 && m.sessionCompleted ? 'The Catalyst' : !m.sessionCompleted ? 'The Anchor' : 'Active',
  })).sort((a, b) => b.optimizationScore - a.optimizationScore)

  return {
    status,
    headline:     status === 'OPTIMAL' ? 'THE PRIME IS INTACT' : status === 'SUB-OPTIMAL' ? 'STATUS: SUB-OPTIMAL' : 'SYSTEMIC FAILURE DETECTED',
    groupSummary: `Group participation at ${Math.round(pct * 100)}%. ${catalyst ? `${catalyst.name} is carrying the Prime Streak.` : 'No catalyst detected.'} ${anchor ? `${anchor.name}'s inactivity is introducing systemic drag.` : 'All members contributing.'}`,
    avatar,
    catalyst:     catalyst ? { name: catalyst.name, message: `${catalyst.name} is the sole reason the Prime Streak remains intact. Optimization status: peak.` } : null,
    anchor:       anchor   ? { name: anchor.name,   message: `${anchor.name}'s inactivity is measurable as systemic drag. Deficit must be corrected.` } : null,
    burden:       catalyst && anchor ? `${catalyst.name} has over-indexed by an estimated 40% to compensate for the gap left by ${anchor.name}.` : null,
    primeStreak:  {
      days:        groupStreak,
      statusLabel: pct >= 0.5 ? 'HOLDING' : 'CRITICAL',
      message:     pct >= 0.5
        ? `The ${groupStreak}-day Prime Streak is holding. One missed session from collapse.`
        : `The ${groupStreak}-day Prime Chain is on life support. Immediate action required.`,
    },
    leaderboard,
    duoLinks: [],
    directive: anchor
      ? `${anchor.name} — your atrophy is a choice. Log a session within 6 hours or the Prime Streak is purged.`
      : 'The group is performing at Prime capacity. Maintain intensity. Optimization is the only metric of success.',
  }
}
