import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-page text-white flex flex-col items-center justify-center px-6 text-center gap-4">
      <span className="text-[56px]">🏋️</span>
      <h1 className="text-[28px] font-black tracking-tight">404 — Page not found</h1>
      <p className="text-[14px] text-gray-500 max-w-xs leading-relaxed">
        This page doesn't exist. Maybe you took a wrong turn on the way to the gym.
      </p>
      <Link
        to="/home"
        className="mt-2 px-6 py-3 rounded-xl text-[14px] font-bold"
        style={{ background: '#3b82f6', color: '#fff', boxShadow: '0 0 20px rgba(59,130,246,0.3)' }}
      >
        Back to home →
      </Link>
    </div>
  )
}
