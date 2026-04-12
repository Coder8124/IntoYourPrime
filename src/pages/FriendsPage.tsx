import { Link } from 'react-router-dom'

export function FriendsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-4 text-white px-6">
      <div className="text-5xl">👥</div>
      <h1 className="text-2xl font-black tracking-tight">Friends</h1>
      <p className="text-gray-500 text-sm text-center max-w-xs">
        Social features — streaks, friend requests, and activity feed — are coming soon.
      </p>
      <Link to="/home" className="mt-4 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors">
        ← Back to Home
      </Link>
    </div>
  )
}
