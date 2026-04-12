import { Link } from 'react-router-dom'

export function ProfilePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-4 text-white">
      <div className="text-4xl">👤</div>
      <h1 className="text-2xl font-black tracking-tight">Profile</h1>
      <p className="text-gray-500 text-sm">Coming soon.</p>
      <Link to="/home" className="text-sm text-blue-400 hover:text-blue-300">← Home</Link>
    </div>
  )
}
