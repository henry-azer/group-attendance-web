// Last line of defence: a render error anywhere below shows a calm fallback with a Reload button
// instead of a blank page. Class component because React has no hook for error boundaries.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './Button.tsx'
import { EmptyState } from './EmptyState.tsx'

export interface ErrorBoundaryProps {
  children: ReactNode
  /** Injected in tests; defaults to reloading the page. */
  onReload?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack)
  }

  private handleReload = () => {
    if (this.props.onReload) this.props.onReload()
    else window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="container screen" role="alert">
        <EmptyState
          title="Something went wrong"
          description="Reloading the page usually fixes it."
          action={<Button onClick={this.handleReload}>Reload</Button>}
        />
      </div>
    )
  }
}
