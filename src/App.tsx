import { useRoute } from './lib/router.ts'
import { CreatedPage } from './pages/CreatedPage.tsx'
import { CreatePage } from './pages/CreatePage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { MemberPage } from './pages/MemberPage.tsx'
import { ToastProvider } from './ui/Toast.tsx'

// Placeholder screens for routes that Tasks 7-8 implement.
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
      return <HomePage />
    case '/new':
      return <CreatePage />
    case '/created':
      return <CreatedPage />
    case '/g/:shareCode':
      return <MemberPage shareCode={params.shareCode} />
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
