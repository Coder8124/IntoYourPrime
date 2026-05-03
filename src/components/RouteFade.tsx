import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Cross-fades route transitions so navigation feels deliberate rather than
 * instant pop-in. Pathname becomes the animation key.
 */
export function RouteFade({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [displayed, setDisplayed] = useState<{ node: ReactNode; key: string }>({
    node: children,
    key: location.pathname,
  })
  const prev = useRef(location.pathname)

  useEffect(() => {
    if (prev.current !== location.pathname) {
      prev.current = location.pathname
      setDisplayed({ node: children, key: location.pathname })
    } else {
      setDisplayed(d => ({ node: children, key: d.key }))
    }
  }, [children, location.pathname])

  return (
    <div key={displayed.key} className="route-fade" style={{ minHeight: '100vh' }}>
      {displayed.node}
    </div>
  )
}
