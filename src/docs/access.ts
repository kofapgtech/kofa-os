import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { DOCS, type Doc, type DocGate } from './index'

/** Which articles the current person can see.
 *
 *  The gates deliberately mirror AppShell's nav gates one-for-one: an article
 *  about a screen should appear for exactly the people who have that screen in
 *  their sidebar. If a nav gate changes, change the matching case here too,
 *  otherwise the docs start advertising screens that 404 on click. */
export function useDocAccess() {
  const {
    isLeadership,
    isAdmin,
    isExecutive,
    isAdminOrExecutive,
    isOwner,
    isHR,
    isPayrollAdmin,
    hasFinancialAccess,
    canManageWorkstreams,
    isContractor,
  } = useAuth()

  return useMemo(() => {
    function passes(gate: DocGate): boolean {
      switch (gate) {
        case 'all':
          return true
        case 'leadership':
          return isLeadership
        case 'payroll':
          return isPayrollAdmin
        case 'finance':
          return hasFinancialAccess
        case 'hr':
          return isHR
        // "Admin" is the section, which HR can reach for the roster slice.
        case 'admin':
          return isAdmin || isExecutive || isHR
        case 'admin-full':
          return isAdminOrExecutive
        case 'workstreams':
          return canManageWorkstreams
        // Contractors are staffed onto projects, not onto the client
        // relationship, so the Accounts screen — and its article — is not
        // theirs whatever role they hold.
        case 'non-contractor':
          return !isContractor
        case 'owner':
          return isOwner
        case 'timesheet-approvals':
          return isLeadership || isPayrollAdmin
        default:
          return true
      }
    }

    /** Any gate passing is enough — an article tagged `leadership, payroll` is
     *  for both audiences, not the intersection. */
    const canRead = (doc: Doc) => doc.roles.some(passes)

    return {
      canRead,
      passes,
      visibleDocs: DOCS.filter(canRead),
    }
  }, [
    isLeadership,
    isAdmin,
    isExecutive,
    isAdminOrExecutive,
    isOwner,
    isHR,
    isPayrollAdmin,
    hasFinancialAccess,
    canManageWorkstreams,
    isContractor,
  ])
}
