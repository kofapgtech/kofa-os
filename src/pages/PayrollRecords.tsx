import { useMemo, useState } from 'react'
import { Landmark } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useActivePayPeriods, useAllProfiles, useEnsurePayPeriods, usePayrollEntries, usePayrollPayments } from '@/lib/queries'
import { EmptyState, PageHeader, SortableTh, Spinner, sortRows, useTableSort } from '@/components/ui'
import { PayrollInvoiceModal } from '@/components/PayrollInvoiceModal'
import { longDate, money } from '@/lib/format'
import type { PayrollPaymentRow } from '@/lib/types'

/** History of every payment recorded through the Payment tab, filterable by
 *  time period and employee. Clicking a row reopens that payment's invoice. */
export function PayrollRecords() {
  const { isPayrollAdmin } = useAuth()
  useEnsurePayPeriods()
  const { periods } = useActivePayPeriods()
  const { data: profiles = [] } = useAllProfiles()
  const { data: payments = [], isLoading } = usePayrollPayments()

  const [periodId, setPeriodId] = useState('')
  const [profileId, setProfileId] = useState('')
  const [selected, setSelected] = useState<PayrollPaymentRow | null>(null)

  const filtered = useMemo(
    () =>
      payments.filter(
        (p) => (!periodId || p.pay_period_id === periodId) && (!profileId || p.profile_id === profileId),
      ),
    [payments, periodId, profileId],
  )

  const { data: entries = [], isLoading: entriesLoading } = usePayrollEntries(
    selected?.pay_period?.period_start,
    selected?.pay_period?.period_end,
  )

  const sort = useTableSort<'employee' | 'period' | 'amount' | 'paid'>()
  const sorted = sortRows(filtered, sort.sortKey, sort.sortDir, (p, key) => {
    switch (key) {
      case 'employee':
        return p.profile?.full_name?.toLowerCase() ?? null
      case 'period':
        return p.pay_period?.period_start ?? null
      case 'amount':
        return p.amount
      case 'paid':
        return p.paid_at
      default:
        return null
    }
  })

  if (!isPayrollAdmin) {
    return <EmptyState title="No payroll access" hint="Ask an admin for access to this page." />
  }
  if (isLoading) return <Spinner />

  return (
    <div>
      <PageHeader title="Records" subtitle="Every payroll payment that's been recorded, most recent first." />

      <div className="mb-4 flex flex-wrap gap-3">
        <div>
          <label className="label">Time period</label>
          <select className="input max-w-sm" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            <option value="">All</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {longDate(p.period_start)} – {longDate(p.period_end)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Employee</label>
          <select className="input max-w-sm" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">All</option>
            {profiles.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No payments recorded yet."
          hint={payments.length === 0 ? "Payments show up here once they're paid from the Payment tab." : 'No payments match these filters.'}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-cream-300 bg-cream-100">
                <SortableTh label="Employee" sortKey="employee" sort={sort} />
                <SortableTh label="Pay period" sortKey="period" sort={sort} />
                <SortableTh label="Amount" sortKey="amount" sort={sort} align="right" className="text-right" />
                <SortableTh label="Paid" sortKey="paid" sort={sort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-b border-cream-100 last:border-0 hover:bg-cream-100"
                  onClick={() => setSelected(p)}
                >
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cream-200 text-ink-600">
                        <Landmark size={14} />
                      </span>
                      {p.profile?.full_name ?? 'Unknown'}
                    </div>
                  </td>
                  <td className="td">
                    {p.pay_period ? `${longDate(p.pay_period.period_start)} – ${longDate(p.pay_period.period_end)}` : '—'}
                  </td>
                  <td className="td text-right tabular-nums font-medium text-ink-900">{money(p.amount)}</td>
                  <td className="td text-ink-500">{longDate(p.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && selected.pay_period && (
        <PayrollInvoiceModal
          periodId={selected.pay_period_id}
          period={selected.pay_period}
          profileId={selected.profile_id}
          name={selected.profile?.full_name ?? 'Unknown'}
          entries={entries.filter((e) => e.profile_id === selected.profile_id)}
          existingPayment={selected}
          isLoading={entriesLoading}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
