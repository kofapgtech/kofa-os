import { CheckCircle2, Landmark } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePayPeriodTotal, usePayPeriods, useMarkPayPeriodPaid } from '@/lib/queries'
import { EmptyState, PageHeader, Spinner } from '@/components/ui'
import { longDate, money } from '@/lib/format'
import type { PayPeriod, PayPeriodStatus } from '@/lib/types'

const STATUS_LABEL: Record<PayPeriodStatus, string> = { open: 'Open', locked: 'Locked', paid: 'Paid' }
const STATUS_CLASS: Record<PayPeriodStatus, string> = {
  open: 'bg-brand-100 text-brand-700',
  locked: 'bg-accent-100 text-accent-700',
  paid: 'bg-cream-200 text-ink-600',
}

/**
 * Review + mark-paid only. Does NOT enforce that a locked/paid period
 * blocks time entry edits — that's an open decision (see the SOP's
 * HR/Payroll section), deliberately left unresolved here.
 */
export function Payroll() {
  const { isPayrollAdmin } = useAuth()
  const { data: periods = [], isLoading } = usePayPeriods()
  const markPaid = useMarkPayPeriodPaid()

  if (!isPayrollAdmin) {
    return <EmptyState title="No payroll access" hint="Ask an admin for access to this page." />
  }
  if (isLoading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Review hours and billable spend by pay period, then mark a period paid once it's been run through Deel."
      />

      {periods.length === 0 ? (
        <EmptyState title="No pay periods yet." hint="Periods are created directly in the database for now." />
      ) : (
        <div className="space-y-3">
          {periods.map((p) => (
            <PeriodRow key={p.id} period={p} onMarkPaid={() => markPaid.mutate(p.id)} pending={markPaid.isPending} />
          ))}
        </div>
      )}
      {markPaid.isError && <p className="mt-3 text-sm text-rose-600">{(markPaid.error as Error).message}</p>}
    </div>
  )
}

function PeriodRow({
  period,
  onMarkPaid,
  pending,
}: {
  period: PayPeriod
  onMarkPaid: () => void
  pending: boolean
}) {
  const { data: total, isLoading } = usePayPeriodTotal(period.period_start, period.period_end)

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cream-200 text-ink-600">
          <Landmark size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink-900">
            {longDate(period.period_start)} – {longDate(period.period_end)}
          </p>
          <p className="text-xs text-ink-500">
            {isLoading ? 'Calculating…' : `${money(total ?? 0)} billable across the org`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`chip ${STATUS_CLASS[period.status]}`}>{STATUS_LABEL[period.status]}</span>
        {period.status !== 'paid' ? (
          <button className="btn-primary" disabled={pending} onClick={onMarkPaid}>
            <CheckCircle2 size={15} /> Mark paid
          </button>
        ) : (
          period.paid_at && <span className="text-xs text-ink-400">Paid {longDate(period.paid_at)}</span>
        )}
      </div>
    </div>
  )
}
