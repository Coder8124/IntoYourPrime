import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] px-6 py-12 text-white">
      <div className="mx-auto flex max-w-lg flex-col gap-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">
            FormIQ
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Home</h1>
          <p className="mt-2 text-sm text-gray-400">
            Jump into the camera workout or test the vision API with static
            images.
          </p>
        </header>

        <nav className="flex flex-col gap-3">
          <Link
            to="/workout"
            className="card-surface flex items-center justify-between px-5 py-4 font-bold transition hover:border-blue-500/40"
          >
            <span>Live workout</span>
            <span className="text-blue-400">→</span>
          </Link>
          <Link
            to="/pipeline-test"
            className="card-surface flex items-center justify-between px-5 py-4 font-bold transition hover:border-blue-500/40"
          >
            <span>Image pipeline test</span>
            <span className="text-blue-400">→</span>
          </Link>
          <Link
            to="/onboarding"
            className="rounded-xl border border-dashed border-gray-700 px-5 py-3 text-center text-sm font-semibold text-gray-500 hover:text-gray-300"
          >
            Edit profile (onboarding)
          </Link>
        </nav>

        <p className="text-center text-xs text-gray-600">
          Run <code className="text-gray-500">vercel dev</code> for{' '}
          <code className="text-gray-500">/api/*</code> locally.
        </p>
      </div>
    </div>
  )
}
