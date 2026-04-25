import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

export function NavigationProgress() {
  const location = useLocation()
  const [pct, setPct] = useState(0)
  const [visible, setVisible] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const prevPath = useRef(location.pathname)

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  const start = () => {
    clear()
    setVisible(true)
    setPct(0)
    timers.current.push(setTimeout(() => setPct(25), 60))
    timers.current.push(setTimeout(() => setPct(55), 250))
    timers.current.push(setTimeout(() => setPct(78), 600))
  }

  const finish = () => {
    clear()
    setPct(100)
    timers.current.push(setTimeout(() => {
      setVisible(false)
      setPct(0)
    }, 300))
  }

  useEffect(() => {
    if (prevPath.current === location.pathname) return
    prevPath.current = location.pathname
    start()
    // Finish once location settled (new page rendered)
    timers.current.push(setTimeout(finish, 50))
    return clear
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  if (!visible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none"
      style={{ background: 'rgba(var(--accent-rgb),0.15)' }}>
      <div
        className="h-full rounded-r-full"
        style={{
          width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
          transition: pct === 100 ? 'width 0.15s ease-out' : 'width 0.4s ease-out',
          boxShadow: '0 0 8px rgba(var(--accent-rgb),0.6)',
        }}
      />
    </div>
  )
}
