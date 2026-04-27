import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen bg-page text-white flex flex-col items-center justify-center px-6 text-center gap-4">
        <span className="text-[48px]">⚠️</span>
        <h1 className="text-[22px] font-black tracking-tight">Something went wrong</h1>
        <p className="text-[13px] text-gray-500 max-w-sm leading-relaxed">
          {this.state.error.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="px-5 py-2.5 rounded-xl text-[13px] font-bold"
            style={{ background: '#3b82f6', color: '#fff' }}
          >
            Try again
          </button>
          <a
            href="/home"
            className="px-5 py-2.5 rounded-xl text-[13px] font-semibold border border-subtle text-muted"
          >
            Go home
          </a>
        </div>
      </div>
    )
  }
}
