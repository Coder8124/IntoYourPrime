const CACHE_NAME = 'iyp-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Handle push notifications from FCM or manual push
self.addEventListener('push', e => {
  const data = e.data?.json() ?? {}
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'IntoYourPrime', {
      body: data.body ?? "Time to train!",
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: data.tag ?? 'iyp-notification',
      data: data,
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const url = e.notification.data?.url ?? '/'
      for (const client of clients) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
