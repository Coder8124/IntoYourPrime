/**
 * useSpeechInput — hands-free voice capture via the Web Speech API.
 *
 * Free, on-device, no backend. Returns `supported: false` where the browser
 * lacks SpeechRecognition (e.g. Firefox), so callers can hide the mic button.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal Web Speech API typings (not in the standard DOM lib).
interface SpeechAlternative { transcript: string }
interface SpeechResult { 0: SpeechAlternative; isFinal: boolean }
interface SpeechResultList { length: number; [index: number]: SpeechResult }
interface SpeechEvent { results: SpeechResultList; resultIndex: number }
interface SpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognition

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useSpeechInput(onResult: (text: string) => void) {
  const recRef      = useRef<SpeechRecognition | null>(null)
  const onResultRef = useRef(onResult)
  const [supported] = useState(() => getCtor() !== null)
  const [listening, setListening] = useState(false)

  useEffect(() => { onResultRef.current = onResult }, [onResult])

  const stop = useCallback(() => { recRef.current?.stop() }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) return
    if (recRef.current) { recRef.current.abort(); recRef.current = null }

    const rec = new Ctor()
    rec.lang            = 'en-US'
    rec.continuous      = false
    rec.interimResults  = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1]
      const text = last?.[0]?.transcript?.trim() ?? ''
      if (text) onResultRef.current(text)
    }
    rec.onend   = () => { setListening(false); recRef.current = null }
    rec.onerror = () => { setListening(false); recRef.current = null }

    recRef.current = rec
    setListening(true)
    try { rec.start() } catch { setListening(false) }
  }, [])

  useEffect(() => () => { recRef.current?.abort() }, [])

  return { supported, listening, start, stop }
}
