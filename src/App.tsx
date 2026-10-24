import { useRoute } from './lib/router.ts'
import { AdminLayout } from './pages/admin/AdminLayout.tsx'
import { CreatedPage } from './pages/CreatedPage.tsx'
import { CreatePage } from './pages/CreatePage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { MemberPage } from './pages/MemberPage.tsx'
import { ErrorBoundary } from './ui/ErrorBoundary.tsx'
import { ToastProvider } from './ui/Toast.tsx'

// Placeholder screen for routes that don't exist.
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
      return <AdminLayout />
    default:
      return <Placeholder title="Not found" />
  }
}

function App() {
  const { path, params } = useRoute()

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Screen path={path} params={params} />
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
