import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { NotificationsProvider } from '@/contexts/NotificationsContext'
import { TimerProvider } from '@/contexts/TimerContext'
import { AppShell } from '@/components/AppShell'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Login } from '@/pages/Login'
import { MyWork } from '@/pages/MyWork'
import { CommandCenter } from '@/pages/CommandCenter'
import { Projects } from '@/pages/Projects'
import { ProjectDetail } from '@/pages/ProjectDetail'
import { Deliverables } from '@/pages/Deliverables'
import { Timesheet } from '@/pages/Timesheet'
import { Accounts } from '@/pages/Accounts'
import { Admin } from '@/pages/Admin'
import { Payroll } from '@/pages/Payroll'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { Portal } from '@/pages/Portal'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: 30_000, retry: 1 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Anonymous, token-scoped client view. No session required. */}
            <Route path="/portal/:token" element={<Portal />} />
            <Route path="/login" element={<Login />} />

            <Route
              element={
                <ProtectedRoute>
                  <NotificationsProvider>
                    <TimerProvider>
                      <AppShell />
                    </TimerProvider>
                  </NotificationsProvider>
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<MyWork />} />
              <Route path="/command" element={<CommandCenter />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:projectId" element={<ProjectDetail />} />
              <Route path="/deliverables" element={<Deliverables />} />
              <Route path="/timesheet" element={<Timesheet />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/payroll" element={<Payroll />} />
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
