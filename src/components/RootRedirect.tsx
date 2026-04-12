import { Navigate } from 'react-router-dom'

/** No auth gate for now — send `/` straight to home. */
export function RootRedirect() {
  return <Navigate to="/home" replace />
}
