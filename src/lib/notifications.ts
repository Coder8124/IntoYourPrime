export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch { /* non-fatal */ }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function showNotification(title: string, body: string, options: NotificationOptions = {}): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico', ...options })
    }).catch(() => {
      new Notification(title, { body, ...options })
    })
  } else {
    new Notification(title, { body, ...options })
  }
}

export function scheduleStreakReminder(streakCount: number): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const lastNotifiedDay = localStorage.getItem('iyp_streak_notif_day')
  const todayKey = new Date().toISOString().slice(0, 10)
  if (lastNotifiedDay === todayKey) return
  localStorage.setItem('iyp_streak_notif_day', todayKey)

  // Schedule at 8PM today (simplified: if it's past 8PM, skip to tomorrow)
  const now = new Date()
  const target = new Date(now)
  target.setHours(20, 0, 0, 0)
  const delay = target.getTime() - now.getTime()
  if (delay <= 0) return

  setTimeout(() => {
    showNotification(
      `Don't break your ${streakCount}-day streak! 🔥`,
      "You haven't worked out today. Keep the streak alive!",
      { tag: 'streak-reminder', data: { url: '/workout' } }
    )
  }, delay)
}

export function checkStreakOnLoad(): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const raw = localStorage.getItem('formAI_lastSession')
    if (!raw) return
    const s = JSON.parse(raw) as Record<string, unknown>
    const lastDate = typeof s.sessionEndedAt === 'number'
      ? new Date(s.sessionEndedAt).toISOString().slice(0, 10)
      : null
    if (!lastDate) return
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    if (lastDate !== today && lastDate !== yesterday) return
    const streak = Number(localStorage.getItem('formAI_streak') ?? 0)
    if (streak > 0) scheduleStreakReminder(streak)
  } catch { /* ignore */ }
}
