import { useRoute } from './lib/router.ts'
import { ToastProvider } from './ui/Toast.tsx'

// Placeholder screens for routes that Tasks 5-8 implement. Kept intentionally thin: this task
// only wires up routing, the API client and the design system.
function Placeholder({ title }: { title: string }) {
  return (
    <div className="container screen">
      <h1>Group Attendance</h1>
      <p className="muted">{title}</p>
    </div>
  )
}

function Screen({ path, params }: { path: string; params: Record<string, string> }) {
  switch (path) {
    case '/':
      return <Placeholder title="Home — coming soon" />
    case '/new':
      return <Placeholder title="Create a group — coming soon" />
    case '/created':
      return <Placeholder title="Group created — coming soon" />
    case '/g/:shareCode':
      return <Placeholder title={`Group ${params.shareCode} — coming soon`} />
    case '/a':
    case '/a/week':
    case '/a/checkin':
    case '/a/insights':
    case '/a/events':
    case '/a/members':
    case '/a/settings':
      return <Placeholder title="Admin — coming soon" />
    default:
      return <Placeholder title="Not found" />
  }
}

function App() {
  const { path, params } = useRoute()

  return (
    <ToastProvider>
      <Screen path={path} params={params} />
    </ToastProvider>
  )
}

export default App
