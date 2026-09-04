import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Spinner } from './ui'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Loading Kofa OS…" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Signed in but no profile: the account was created without invite
  // metadata, so RLS denies everything. Say so instead of showing empty screens.
  if (!profile) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="card max-w-md p-6 text-center">
          <p className="text-base font-semibold text-ink-900">No workspace access</p>
          <p className="mt-2 text-sm text-ink-600">
            This account isn't attached to a Kofa OS profile yet. An admin needs to invite it before
            it can see anything.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

/** Closes a route to contractors. Pairs with the 'non-contractor' nav gate in
 *  AppShell: hiding the link alone would still leave the page one typed URL
 *  away, so the route sends them home instead of rendering it.
 *
 *  A redirect rather than a "no access" panel, deliberately — the point is
 *  that the section isn't part of a contractor's app at all, and an explainer
 *  screen would advertise the very thing being hidden. Access that a person
 *  could reasonably ask to be granted (payroll, admin) keeps the panel. */
export function NonContractorRoute({ children }: { children: ReactNode }) {
  const { isContractor } = useAuth()
  if (isContractor) return <Navigate to="/" replace />
  return <>{children}</>
}
