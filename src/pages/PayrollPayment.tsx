import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  groupPayrollEntries,
  useActivePayPeriods,
  useEnsurePayPeriods,
  useEnsureTimesheetWeeks,
  usePayrollApprovalBlockers,
  usePayrollEntries,
  usePayrollPaymentsForPeriod,
} from '@/lib/queries'
import { EmptyState, PageHeader, SortableTh, Spinner, sortRows, useTableSort } from '@/components/ui'
import { PayrollInvoiceModal } from '@/components/PayrollInvoiceModal'
import { hours, longDate, money } from '@/lib/format'

/**
 * One time period, two views on it: every employee who logged hours (and
 * what they're owed), and every project worked on (and what it cost).
 * Clicking a row drills into a modal — an employee row shows their
 * per-project breakdown with a pay action, a project row shows who worked
 * on it. "Pay now" is bookkeeping only — it records the payment so it shows
 * up under Records, but doesn't move money. The payout still runs through
 * Deel until that trigger is wired up.
 */
export function PayrollPayment() {
  const { isPayrollAdmin } = useAuth()
  useEnsurePayPeriods()
  const { periods, isLoading: periodsLoading } = useActivePayPeriods()

  const [periodId, setPeriodId] = useState('')
  useEffect(() => {
    if (periods.length > 0 && !periods.some((p) => p.id === periodId)) setPeriodId(periods[0].id)
  }, [periodId, periods])

  const period = periods.find((p) => p.id === periodId)
  const { data: entries = [], isLoading: entriesLoading } = usePayrollEntries(period?.period_start, period?.period_end)
  const { data: payments = [] } = usePayrollPaymentsForPeriod(periodId || undefined)
  const paidByProfile = useMemo(() => new Map(payments.map((p) => [p.profile_id, p])), [payments])

  // Contractors' hours have to clear the workstream lead and then the managing
  // director before finance may pay them. This is the same rule the database
  // enforces in record_payroll_payment() — surfaced here so the Pay action
  // explains itself instead of failing.
  useEnsureTimesheetWeeks()
  const { blockers } = usePayrollApprovalBlockers(period?.period_start, period?.period_end)

  const byEmployee = useMemo(() => groupPayrollEntries(entries, 'profile'), [entries])
  const byProject = useMemo(() => groupPayrollEntries(entries, 'project'), [entries])
  const periodTotal = useMemo(() => byEmployee.reduce((sum, row) => sum + row.amount, 0), [byEmployee])
  // Deliverable-tracked work owes a flat fee rather than hours, so it lands in
  // these totals with zero hours against it. Calling it out stops the by-hours
  // columns from looking like they've lost money they never had.
  const feeTotal = useMemo(
    () => entries.filter((e) => e.kind === 'fee').reduce((sum, e) => sum + e.amount, 0),
    [entries],
  )

  const employeeSort = useTableSort<'name' | 'hours' | 'amount'>()
  const sortedByEmployee = sortRows(byEmployee, employeeSort.sortKey, employeeSort.sortDir, (row, key) => row[key])
  const projectSort = useTableSort<'name' | 'hours' | 'amount'>()
  const sortedByProject = sortRows(byProject, projectSort.sortKey, projectSort.sortDir, (row, key) => row[key])

  const [openEmployeeId, setOpenEmployeeId] = useState<string | null>(null)
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)

  if (!isPayrollAdmin) {
    return <EmptyState title="No payroll access" hint="Ask an admin for access to this page." />
  }
  if (periodsLoading) return <Spinner />

  return (
    <div>
      <PageHeader title="Payment" subtitle="Review a pay period's hours, deliverable fees and billable spend, by employee and by project." />

      {periods.length === 0 ? (
        <EmptyState title="No pay periods yet." />
      ) : (
        <>
          <div className="mb-4">
            <label className="label">Time period</label>
            <select
              className="input max-w-sm"
              value={periodId}
              onChange={(e) => {
                setPeriodId(e.target.value)
                setOpenEmployeeId(null)
                setOpenProjectId(null)
              }}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {longDate(p.period_start)} – {longDate(p.period_end)}
                </option>
              ))}
            </select>
          </div>

          {entriesLoading ? (
            <Spinner />
          ) : (
            <>
              {byEmployee.length > 0 && (
                <p className="mb-3 text-sm text-ink-600">
                  <span className="font-semibold text-ink-900">{money(periodTotal)}</span> total across{' '}
                  {byEmployee.length} employee{byEmployee.length === 1 ? '' : 's'} this period
                  {feeTotal > 0 && (
                    <> · includes {money(feeTotal)} in accepted deliverable fees, which carry no hours</>
                  )}
                </p>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card p-4">
                  <p className="mb-3 text-sm font-semibold text-ink-900">Employees</p>
                  {byEmployee.length === 0 ? (
                    <p className="text-sm text-ink-500">No time logged this period.</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-cream-300">
                          <SortableTh label="Employee" sortKey="name" sort={employeeSort} />
                          <SortableTh label="Hours" sortKey="hours" sort={employeeSort} align="right" className="text-right" />
                          <SortableTh label="Amount to pay" sortKey="amount" sort={employeeSort} align="right" className="text-right" />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedByEmployee.map((row) => (
                          <tr
                            key={row.id}
                            className="cursor-pointer border-b border-cream-100 last:border-0 hover:bg-cream-100"
                            onClick={() => setOpenEmployeeId(row.id)}
                          >
                            <td className="td">
                              {row.name}
                              {paidByProfile.has(row.id) && <span className="chip ml-2 bg-cream-200 text-ink-600">Paid</span>}
                              {!paidByProfile.has(row.id) && blockers.has(row.id) && (
                                <span className="chip ml-2 bg-amber-100 text-amber-800">
                                  Awaiting approval
                                </span>
                              )}
                            </td>
                            <td className="td text-right tabular-nums">{hours(row.hours)}</td>
                            <td className="td text-right tabular-nums">{money(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="card p-4">
                  <p className="mb-3 text-sm font-semibold text-ink-900">Projects</p>
                  {byProject.length === 0 ? (
                    <p className="text-sm text-ink-500">No time logged this period.</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-cream-300">
                          <SortableTh label="Project" sortKey="name" sort={projectSort} />
                          <SortableTh label="Hours" sortKey="hours" sort={projectSort} align="right" className="text-right" />
                          <SortableTh label="Amount spent" sortKey="amount" sort={projectSort} align="right" className="text-right" />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedByProject.map((row) => (
                          <tr
                            key={row.id}
                            className="cursor-pointer border-b border-cream-100 last:border-0 hover:bg-cream-100"
                            onClick={() => setOpenProjectId(row.id)}
                          >
                            <td className="td">{row.name}</td>
                            <td className="td text-right tabular-nums">{hours(row.hours)}</td>
                            <td className="td text-right tabular-nums">{money(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {openEmployeeId && period && (
        <PayrollInvoiceModal
          periodId={periodId}
          period={period}
          profileId={openEmployeeId}
          name={byEmployee.find((e) => e.id === openEmployeeId)?.name ?? ''}
          entries={entries.filter((e) => e.profile_id === openEmployeeId)}
          existingPayment={paidByProfile.get(openEmployeeId) ?? null}
          blockedWeeks={blockers.get(openEmployeeId) ?? []}
          onClose={() => setOpenEmployeeId(null)}
        />
      )}

      {openProjectId && period && (
        <PayrollInvoiceModal
          period={period}
          name={byProject.find((p) => p.id === openProjectId)?.name ?? ''}
          entries={entries.filter((e) => e.project_id === openProjectId)}
          groupBy="profile"
          onClose={() => setOpenProjectId(null)}
        />
      )}
    </div>
  )
}
