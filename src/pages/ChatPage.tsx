import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import OpenAI from 'openai'
import { auth, db } from '../lib/firebase'
import { getUserSessions } from '../lib/firebaseHelpers'
import { isProSubscriber, loadSubscriptionStatus } from '../lib/subscriptionStatus'

interface Message {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

const SUGGESTED = [
  'Why do my knees hurt during squats?',
  'Build me a 3-day beginner program',
  'How do I improve my pushup form?',
  'What should I eat before a workout?',
  "I'm sore — should I still train today?",
  'How many reps for muscle growth vs strength?',
]

async function buildContext(): Promise<string> {
  const user = auth.currentUser
  if (!user) return ''
  try {
    const sessions = await getUserSessions(user.uid, 7)
    if (!sessions.length) return ''
    return sessions
      .map(s => `${s.date}: ${s.exercises.slice(0, 5).join(', ')} · ${s.durationMinutes}min · risk ${s.avgRiskScore.toFixed(0)}`)
      .join('\n')
  } catch {
    return ''
  }
}

const SYSTEM = (ctx: string) => [
  'You are a personal fitness trainer inside the IntoYourPrime app.',
  'Give concise, practical, evidence-based advice in 1–4 sentences unless the user asks for more.',
  'When referencing exercises use lowercase names: squat, pushup, deadlift, bicepcurl, shoulderpress, lunge, plank, etc.',
  ctx ? `\nUser's recent workout history:\n${ctx}` : '',
].filter(Boolean).join('\n')

export function ChatPage() {
  const navigate = useNavigate()
  const [messages, setMessages]       = useState<Message[]>([])
  const [input, setInput]             = useState('')
  const [sending, setSending]         = useState(false)
  const [initDone, setInitDone]       = useState(false)
  const [isPro, setIsPro]             = useState(false)
  const [apiKey, setApiKey]           = useState<string | null>(null)
  const bottomRef                     = useRef<HTMLDivElement>(null)
  const inputRef                      = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const init = async () => {
      await loadSubscriptionStatus()
      setIsPro(isProSubscriber())
      setApiKey(localStorage.getItem('formAI_openai_key'))

      const user = auth.currentUser
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid, 'chats', 'trainer'))
          if (snap.exists()) setMessages(snap.data().messages ?? [])
        } catch {}
      }
      setInitDone(true)
    }
    init()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const persist = async (msgs: Message[]) => {
    const user = auth.currentUser
    if (!user) return
    try {
      await setDoc(doc(db, 'users', user.uid, 'chats', 'trainer'), { messages: msgs.slice(-30) })
    } catch {}
  }

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setInput('')
    setSending(true)

    const userMsg: Message = { role: 'user', content: trimmed, ts: Date.now() }
    const history = [...messages, userMsg]
    setMessages(history)

    try {
      const convo = history.map(m => ({ role: m.role, content: m.content }))
      let reply = ''

      if (isPro) {
        const token = await auth.currentUser?.getIdToken() ?? ''
        const ctx = await buildContext()
        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messages: convo, workoutContext: ctx }),
        })
        if (resp.status === 429) reply = "You've reached your monthly AI limit. It resets next month."
        else if (resp.status === 402) reply = 'This feature requires a Pro subscription.'
        else if (!resp.ok) throw new Error(`${resp.status}`)
        else reply = (await resp.json()).reply ?? ''
      } else if (apiKey) {
        const ctx = await buildContext()
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
        const res = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: SYSTEM(ctx) }, ...convo],
          max_tokens: 400,
        })
        reply = res.choices[0].message.content ?? ''
      } else {
        reply = 'To chat with your AI trainer, add an OpenAI API key in Profile — or upgrade to Pro for GPT-4o access with usage tracking.'
      }

      const aiMsg: Message = { role: 'assistant', content: reply, ts: Date.now() }
      const final = [...history, aiMsg]
      setMessages(final)
      persist(final)
    } catch {
      const errMsg: Message = { role: 'assistant', content: 'Something went wrong. Please try again.', ts: Date.now() }
      const final = [...history, errMsg]
      setMessages(final)
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const clearChat = async () => {
    setMessages([])
    const user = auth.currentUser
    if (user) {
      try { await setDoc(doc(db, 'users', user.uid, 'chats', 'trainer'), { messages: [] }) } catch {}
    }
  }

  const canChat = isPro || !!apiKey

  return (
    <div className="flex flex-col min-h-screen bg-page text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-subtle"
        style={{ background: 'rgba(7,7,14,0.95)', backdropFilter: 'blur(16px)' }}>
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-white text-[18px]">←</button>
        <div className="text-center">
          <p className="text-[15px] font-bold">AI Trainer</p>
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            {isPro ? '⚡ Pro · GPT-4o' : apiKey ? '🔑 API Key · GPT-4o-mini' : 'Add key or go Pro'}
          </p>
        </div>
        <button onClick={clearChat} className="p-2 text-[12px] text-gray-500 hover:text-red-400">Clear</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-36">
        {!initDone ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-600/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="space-y-5 pt-2">
            {/* Avatar + greeting */}
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[16px]"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>🤖</div>
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-[14px] leading-relaxed flex-1"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                Hey! I'm your personal AI trainer. Ask me anything about training, form, recovery, or nutrition — I'll tailor advice to your workout history.
              </div>
            </div>

            {!canChat && (
              <div className="rounded-2xl px-4 py-4 text-center space-y-3"
                style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <p className="text-[13px] font-semibold text-white">Get started</p>
                <p className="text-[12px] text-gray-400">Add an OpenAI API key or upgrade to Pro to start chatting.</p>
                <button onClick={() => navigate('/profile')}
                  className="px-5 py-2 rounded-xl text-[13px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
                  Go to Profile →
                </button>
              </div>
            )}

            {/* Suggested prompts */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest px-1" style={{ color: 'var(--text-3)' }}>Try asking</p>
              {SUGGESTED.map(p => (
                <button key={p} onClick={() => send(p)}
                  className="w-full text-left px-4 py-2.5 rounded-xl text-[13px] text-gray-300 transition-colors hover:text-white"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[13px] mt-0.5"
                    style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>🤖</div>
                )}
                <div className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed ${
                  msg.role === 'user' ? 'rounded-tr-sm text-white' : 'rounded-tl-sm'
                }`} style={msg.role === 'user'
                  ? { background: '#3b82f6' }
                  : { background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[13px]"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>🤖</div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex gap-1 items-center h-4">
                    {[0, 150, 300].map(delay => (
                      <div key={delay} className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
                        style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-3 pb-safe border-t border-subtle"
        style={{ background: 'rgba(7,7,14,0.97)', backdropFilter: 'blur(16px)' }}>
        <div className="flex gap-2 items-center">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder="Ask your trainer…"
            className="flex-1 rounded-2xl px-4 py-3 text-[14px] text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/60"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            disabled={sending}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || sending}
            className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[18px] transition-opacity disabled:opacity-30 shrink-0"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}
          >↑</button>
        </div>
      </div>
    </div>
  )
}
