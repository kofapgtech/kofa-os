import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { NotificationsProvider } from '@/contexts/NotificationsContext'
import { TimerProvider } from '@/contexts/TimerContext'
import { ToastProvider } from '@/contexts/ToastContext'
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
import { AdminEmployees } from '@/pages/AdminEmployees'
import { AdminWorkstreams } from '@/pages/AdminWorkstreams'
import { PayrollPayment } from '@/pages/PayrollPayment'
import { PayrollRecords } from '@/pages/PayrollRecords'
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
        <ToastProvider>
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
              <Route path="/admin" element={<Navigate to="/admin/employees" replace />} />
              <Route path="/admin/employees" element={<AdminEmployees />} />
              <Route path="/admin/workstreams" element={<AdminWorkstreams />} />
              <Route path="/payroll" element={<Navigate to="/payroll/payment" replace />} />
              <Route path="/payroll/payment" element={<PayrollPayment />} />
              <Route path="/payroll/records" element={<PayrollRecords />} />
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
