import { useMemo } from 'react'
import { CheckCircle2, Printer, X } from 'lucide-react'
import { groupPayrollEntries, usePayEmployee } from '@/lib/queries'
import { Modal, SortableTh, Spinner, sortRows, useTableSort } from '@/components/ui'
import { hours, longDate, money } from '@/lib/format'
import type { PayrollEntry, PayrollPayment } from '@/lib/types'

/**
 * One period's line items grouped either by project (an employee's invoice,
 * with a Pay now action) or by employee (a project's drill-down, read-only).
 * Used from the Payment tab (where existingPayment may still be null) and
 * from Records (where it's always already paid, opened to view/print the
 * invoice again).
 */
export function PayrollInvoiceModal({
  periodId,
  period,
  profileId,
  name,
  entries,
  existingPayment,
  groupBy = 'project',
  isLoading = false,
  onClose,
}: {
  periodId?: string
  period: { period_start: string; period_end: string }
  profileId?: string
  name: string
  entries: PayrollEntry[]
  existingPayment?: PayrollPayment | null
  /** 'project' = employee invoice (rows are projects, with a pay action).
   *  'profile' = project drill-down (rows are employees, read-only). */
  groupBy?: 'project' | 'profile'
  isLoading?: boolean
  onClose: () => void
}) {
  const payEmployee = usePayEmployee()
  // Server-side (record_payroll_payment) is the real gate -- this just avoids
  // a round-trip error for the common case of trying to pay out a period
  // that's still accumulating hours.
  const periodHasEnded = period.period_end < new Date().toISOString().slice(0, 10)
  const rows = useMemo(() => groupPayrollEntries(entries, groupBy), [entries, groupBy])
  const totalHours = rows.reduce((sum, li) => sum + li.hours, 0)
  const totalAmount = rows.reduce((sum, li) => sum + li.amount, 0)

  const sort = useTableSort<'name' | 'hours' | 'amount'>()
  const sortedRows = sortRows(rows, sort.sortKey, sort.sortDir, (li, key) => li[key])

  const columnLabel = groupBy === 'project' ? 'Project' : 'Employee'
  const amountLabel = groupBy === 'project' ? 'Amount to be paid' : 'Amount'
  const totalLabel = groupBy === 'project' ? 'Total for this pay period' : 'Total'
  const emptyLabel = groupBy === 'project' ? 'No billable hours in this period.' : 'No time logged on this project in this period.'

  return (
    <Modal onClose={onClose}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-900">{name}</p>
          <p className="text-xs text-ink-500">
            {longDate(period.period_start)} – {longDate(period.period_end)}
          </p>
        </div>
        <button className="btn-ghost !px-2.5 print:hidden" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-500">{emptyLabel}</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-cream-300">
              <SortableTh label={columnLabel} sortKey="name" sort={sort} />
              <SortableTh label="Hours logged" sortKey="hours" sort={sort} align="right" className="text-right" />
              <SortableTh label={amountLabel} sortKey="amount" sort={sort} align="right" className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((li) => (
              <tr key={li.id} className="border-b border-cream-100">
                <td className="td">{li.name}</td>
                <td className="td text-right tabular-nums">{hours(li.hours)}</td>
                <td className="td text-right tabular-nums">{money(li.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="td pt-3 font-semibold text-ink-900">{totalLabel}</td>
              <td className="td pt-3 text-right font-semibold tabular-nums text-ink-900">{hours(totalHours)}</td>
              <td className="td pt-3 text-right font-semibold tabular-nums text-ink-900">{money(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      {groupBy === 'project' && !isLoading && (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 print:hidden">
          {rows.length > 0 && (
            <button className="btn-ghost" onClick={() => window.print()}>
              <Printer size={15} /> Print invoice
            </button>
          )}
          {existingPayment ? (
            <span className="chip bg-cream-200 text-ink-600">
              Paid {longDate(existingPayment.paid_at)} · {money(existingPayment.amount)}
            </span>
          ) : rows.length > 0 && periodId && profileId && !periodHasEnded ? (
            <span className="chip bg-cream-200 text-ink-600">
              Available once this period ends ({longDate(period.period_end)})
            </span>
          ) : (
            rows.length > 0 &&
            periodId &&
            profileId && (
              <button
                className="btn-primary"
                disabled={payEmployee.isPending}
                onClick={() => payEmployee.mutate({ periodId, profileId, amount: totalAmount })}
              >
                <CheckCircle2 size={15} /> Pay now
              </button>
            )
          )}
        </div>
      )}
    </Modal>
  )
}
