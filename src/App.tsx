import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { NotificationsProvider } from '@/contexts/NotificationsContext'
import { TimerProvider } from '@/contexts/TimerContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { AppShell } from '@/components/AppShell'
import { NonContractorRoute, ProtectedRoute } from '@/components/ProtectedRoute'
import { Login } from '@/pages/Login'
import { MyWork } from '@/pages/MyWork'
import { CommandCenter } from '@/pages/CommandCenter'
import { Projects } from '@/pages/Projects'
import { ProjectDetail } from '@/pages/ProjectDetail'
import { Deliverables } from '@/pages/Deliverables'
import { Timesheet } from '@/pages/Timesheet'
import { TimesheetApprovals } from '@/pages/TimesheetApprovals'
import { Accounts } from '@/pages/Accounts'
import { AdminContractors, AdminEmployees } from '@/pages/AdminEmployees'
import { AdminDepartments } from '@/pages/AdminDepartments'
import { PayrollPayment } from '@/pages/PayrollPayment'
import { PayrollRecords } from '@/pages/PayrollRecords'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { ProfilePage } from '@/pages/Profile'
import { Settings } from '@/pages/Settings'
import { Onboarding } from '@/pages/Onboarding'
import { Portal } from '@/pages/Portal'
import { Tickets } from '@/pages/Tickets'
import { ManageTickets } from '@/pages/ManageTickets'
import { Docs } from '@/pages/Docs'

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
            {/* Inside ProtectedRoute but OUTSIDE AppShell: the wizard brings its
                own chrome, and the sidebar would offer a new hire a dozen places
                to go before they have any idea what those places are. */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />

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
              <Route path="/timesheet/approvals" element={<TimesheetApprovals />} />
              <Route
                path="/accounts"
                element={
                  <NonContractorRoute>
                    <Accounts />
                  </NonContractorRoute>
                }
              />
              <Route path="/admin" element={<Navigate to="/admin/employees" replace />} />
              <Route path="/admin/employees" element={<AdminEmployees />} />
              <Route path="/admin/contractors" element={<AdminContractors />} />
              <Route path="/admin/workstreams" element={<AdminDepartments />} />
              <Route path="/payroll" element={<Navigate to="/payroll/payment" replace />} />
              <Route path="/payroll/payment" element={<PayrollPayment />} />
              <Route path="/payroll/records" element={<PayrollRecords />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/tickets/manage" element={<ManageTickets />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/docs/:slug" element={<Docs />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
