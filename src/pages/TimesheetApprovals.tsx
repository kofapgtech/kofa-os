import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, RotateCcw, Undo2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useDecideTimesheetWeek,
  useDepartmentLeads,
  useEnsureTimesheetWeeks,
  useProjectBudgets,
  useTasks,
  useTimesheetWeekEntries,
  useTimesheetWeekReviews,
  useTimesheetWeeks,
} from '@/lib/queries'
import {
  Chip,
  EmptyState,
  Modal,
  ModalHeader,
  PageHeader,
  SortableTh,
  Spinner,
  sortRows,
  useTableSort,
} from '@/components/ui'
import {
  TIMESHEET_STATUS_CLASS,
  TIMESHEET_STATUS_LABEL,
  TIMESHEET_STATUS_SHORT,
  minutesToHours,
  money,
  relativeTime,
  shortDate,
  weekRange,
} from '@/lib/format'
import type { TimesheetWeekRow } from '@/lib/types'

/**
 * The middle of the contractor pay chain: a workstream lead confirms the
 * hours logged against their workstream, then the managing director clears
 * the week for payroll. Both steps live on this one page — which one you see
 * a week under depends on where it has got to and what you are.
 *
 * Weeks arrive here on their own: ensure_timesheet_weeks() submits any week
 * that has finished, so this queue fills up on Monday without anybody
 * pressing submit. Sending a week back unlocks its entries so the person can
 * fix them and resubmit.
 */
export function TimesheetApprovals() {
  const { profile, isLeadership, isAdminOrExecutive, isPayrollAdmin, hasFinancialAccess } = useAuth()
  const [params, setParams] = useSearchParams()

  useEnsureTimesheetWeeks()
  const { data: weeks = [], isLoading } = useTimesheetWeeks()
  const { data: extraLeads = [] } = useDepartmentLeads()

  const [openId, setOpenId] = useState<string | null>(params.get('week'))
  useEffect(() => {
    const fromUrl = params.get('week')
    if (fromUrl) setOpenId(fromUrl)
  }, [params])

  /** Whether I am one of the people this workstream's hours route to. Mirrors
   *  timesheet_week_approvers() on the server: the workstream's own lead, plus
   *  anyone tagged as an additional lead — and admins/executives, who can act
   *  at either step so a week is never stuck. */
  function leadsWorkstream(departmentId: string | null) {
    if (isAdminOrExecutive) return true
    if (!profile) return false
    if (departmentId && profile.role === 'dept_lead' && profile.department_id === departmentId) {
      return true
    }
    return extraLeads.some(
      (l) => l.department_id === departmentId && l.profile_id === profile.user_id,
    )
  }

  const mine = useMemo(
    () =>
      weeks.filter((w) => {
        if (w.user_id === profile?.user_id) return false // never review your own
        if (w.status === 'pending_lead') return leadsWorkstream(w.department_id)
        if (w.status === 'pending_md') return isAdminOrExecutive
        return false
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weeks, profile?.user_id, isAdminOrExecutive, extraLeads],
  )

  const returned = useMemo(() => weeks.filter((w) => w.status === 'rejected'), [weeks])
  const cleared = useMemo(
    () => weeks.filter((w) => w.status === 'approved').slice(0, 25),
    [weeks],
  )

  const open = weeks.find((w) => w.id === openId) ?? null

  if (!isLeadership && !isPayrollAdmin) {
    return (
      <EmptyState
        title="No approval access"
        hint="Timesheet approvals are for workstream leads, the managing director and finance."
      />
    )
  }
  if (isLoading) return <Spinner />

  function close() {
    setOpenId(null)
    if (params.get('week')) {
      params.delete('week')
      setParams(params, { replace: true })
    }
  }

  return (
    <div>
      <PageHeader
        title="Timesheet approvals"
        subtitle="Contractor weeks are submitted automatically once the week ends, confirmed by the workstream lead, then cleared by the managing director before finance can pay them."
      />

      <WeekTable
        title="Waiting on you"
        empty="Nothing to approve right now."
        rows={mine}
        showMoney={hasFinancialAccess}
        onOpen={setOpenId}
      />

      {returned.length > 0 && (
        <WeekTable
          title="Sent back — waiting on the person"
          empty=""
          rows={returned}
          showMoney={hasFinancialAccess}
          onOpen={setOpenId}
        />
      )}

      {cleared.length > 0 && (
        <WeekTable
          title="Cleared for payroll"
          empty=""
          rows={cleared}
          showMoney={hasFinancialAccess}
          onOpen={setOpenId}
        />
      )}

      {open && (
        <WeekReviewModal
          week={open}
          canLeadApprove={
            open.status === 'pending_lead' &&
            open.user_id !== profile?.user_id &&
            leadsWorkstream(open.department_id)
          }
          canMdApprove={
            open.status === 'pending_md' && open.user_id !== profile?.user_id && isAdminOrExecutive
          }
          canReject={open.user_id !== profile?.user_id && leadsWorkstream(open.department_id)}
          canReopen={isAdminOrExecutive}
          showMoney={hasFinancialAccess}
          onClose={close}
        />
      )}
    </div>
  )
}

function WeekTable({
  title,
  empty,
  rows,
  showMoney,
  onOpen,
}: {
  title: string
  empty: string
  rows: TimesheetWeekRow[]
  showMoney: boolean
  onOpen: (id: string) => void
}) {
  const sort = useTableSort<
    'user_name' | 'week_start' | 'department_name' | 'total_minutes' | 'cost_amount' | 'fee_amount'
  >(
    'week_start',
    'desc',
  )
  const sorted = sortRows(rows, sort.sortKey, sort.sortDir, (row, key) => row[key] ?? '')

  return (
    <div className="mb-6">
      <p className="mb-2.5 text-sm font-semibold uppercase tracking-wide text-ink-500">{title}</p>
      {rows.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink-500">{empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-cream-300 bg-cream-100">
                <tr>
                  <SortableTh label="Person" sortKey="user_name" sort={sort} />
                  <SortableTh label="Week" sortKey="week_start" sort={sort} />
                  <SortableTh label="Workstream" sortKey="department_name" sort={sort} />
                  <SortableTh
                    label="Hours"
                    sortKey="total_minutes"
                    sort={sort}
                    align="right"
                    className="text-right"
                  />
                  <SortableTh
                    label="Fees"
                    sortKey="fee_amount"
                    sort={sort}
                    align="right"
                    className="text-right"
                  />
                  {showMoney && (
                    <SortableTh
                      label="Cost"
                      sortKey="cost_amount"
                      sort={sort}
                      align="right"
                      className="text-right"
                    />
                  )}
                  <th className="th text-right">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {sorted.map((w) => (
                  <tr
                    key={w.id}
                    className="cursor-pointer hover:bg-cream-100"
                    onClick={() => onOpen(w.id)}
                  >
                    <td className="td font-medium text-ink-900">{w.user_name ?? 'Unknown'}</td>
                    <td className="td">{weekRange(w.week_start)}</td>
                    <td className="td text-ink-600">{w.department_name ?? 'No workstream'}</td>
                    <td className="td text-right tabular-nums">
                      {minutesToHours(w.total_minutes).toFixed(2)}
                    </td>
                    <td className="td text-right tabular-nums">
                      {w.fee_amount > 0 ? money(w.fee_amount) : <span className="text-ink-400">—</span>}
                    </td>
                    {showMoney && (
                      <td className="td text-right tabular-nums">{money(w.cost_amount)}</td>
                    )}
                    <td className="td text-right">
                      <Chip className={TIMESHEET_STATUS_CLASS[w.status]}>
                        {w.paid_at ? 'Paid' : TIMESHEET_STATUS_SHORT[w.status]}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/** The week itself: every entry behind it, what has happened to it so far,
 *  and the two things an approver can do about it. A rejection needs a
 *  comment — the server enforces it too, this just says so first. */
function WeekReviewModal({
  week,
  canLeadApprove,
  canMdApprove,
  canReject,
  canReopen,
  showMoney,
  onClose,
}: {
  week: TimesheetWeekRow
  canLeadApprove: boolean
  canMdApprove: boolean
  canReject: boolean
  canReopen: boolean
  showMoney: boolean
  onClose: () => void
}) {
  const decide = useDecideTimesheetWeek()
  const { data: entries = [], isLoading } = useTimesheetWeekEntries(week)
  const { data: reviews = [] } = useTimesheetWeekReviews(week.id)
  const { data: projects = [] } = useProjectBudgets()
  const { data: tasks = [] } = useTasks()

  const [rejecting, setRejecting] = useState(false)
  const [comment, setComment] = useState('')

  const projectName = (id: string) => projects.find((p) => p.project_id === id)?.name ?? 'Unknown'
  const taskName = (id: string | null) => tasks.find((t) => t.id === id)?.title ?? 'No task'

  function run(decision: 'lead_approve' | 'md_approve' | 'reject' | 'reopen') {
    decide.mutate(
      { weekId: week.id, decision, comment: decision === 'reject' ? comment : undefined },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <ModalHeader
        title={`${week.user_name ?? 'Unknown'} — ${weekRange(week.week_start)}`}
        icon={<CheckCircle2 size={18} />}
        onClose={onClose}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-600">
        <Chip className={TIMESHEET_STATUS_CLASS[week.status]}>
          {week.paid_at ? 'Paid' : TIMESHEET_STATUS_LABEL[week.status]}
        </Chip>
        <span>{week.department_name ?? 'No workstream'}</span>
        <span className="text-ink-300">·</span>
        <span className="font-semibold text-ink-900">
          {minutesToHours(week.total_minutes).toFixed(2)}h
        </span>
        {week.fee_count > 0 && (
          <>
            <span className="text-ink-300">·</span>
            <span className="font-semibold text-brand-600">
              {money(week.fee_amount)} in deliverable fees
            </span>
          </>
        )}
        {showMoney && (
          <>
            <span className="text-ink-300">·</span>
            <span className="font-semibold text-ink-900">{money(week.cost_amount)}</span>
          </>
        )}
      </div>

      {week.status === 'rejected' && week.rejection_comment && (
        <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          {week.rejection_comment}
          {week.rejected_by_name && (
            <span className="block text-xs text-rose-600">— {week.rejected_by_name}</span>
          )}
        </div>
      )}

      <div className="max-h-64 overflow-y-auto rounded-lg border border-cream-300">
        {isLoading ? (
          <Spinner />
        ) : entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-500">No entries in this week.</p>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-cream-100">
              <tr>
                <th className="th">Day</th>
                <th className="th">Work</th>
                <th className="th text-right">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="td whitespace-nowrap text-ink-600">{shortDate(e.started_at)}</td>
                  <td className="td">
                    <span className="block text-ink-900">{taskName(e.task_id)}</span>
                    <span className="block text-xs text-ink-500">
                      {projectName(e.project_id)}
                      {e.description ? ` · ${e.description}` : ''}
                      {!e.is_billable ? ' · internal' : ''}
                    </span>
                  </td>
                  <td className="td text-right tabular-nums">
                    {minutesToHours(e.duration_minutes).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reviews.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
            History
          </p>
          <ul className="space-y-1 text-xs text-ink-500">
            {reviews.map((r) => (
              <li key={r.id}>
                {DECISION_LABEL[r.decision] ?? r.decision} · {relativeTime(r.created_at)}
                {r.comment ? ` — ${r.comment}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejecting && (
        <div className="mt-4">
          <label className="label">What needs fixing?</label>
          <textarea
            className="input min-h-[72px]"
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. Thursday's 9h looks like a stopped-late timer — please split it."
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Close
        </button>

        {canReopen && week.status === 'approved' && !week.paid_at && (
          <button className="btn-ghost" disabled={decide.isPending} onClick={() => run('reopen')}>
            <RotateCcw size={15} /> Reopen
          </button>
        )}

        {canReject && !week.paid_at && week.status !== 'rejected' && (
          <button
            className="btn-danger"
            disabled={decide.isPending || (rejecting && comment.trim().length === 0)}
            onClick={() => (rejecting ? run('reject') : setRejecting(true))}
          >
            <Undo2 size={15} /> {rejecting ? 'Send it back' : 'Send back'}
          </button>
        )}

        {!rejecting && canLeadApprove && (
          <button
            className="btn-primary"
            disabled={decide.isPending}
            onClick={() => run('lead_approve')}
          >
            <CheckCircle2 size={15} /> Confirm hours
          </button>
        )}

        {!rejecting && canMdApprove && (
          <button
            className="btn-primary"
            disabled={decide.isPending}
            onClick={() => run('md_approve')}
          >
            <CheckCircle2 size={15} /> Approve for payroll
          </button>
        )}
      </div>
    </Modal>
  )
}

const DECISION_LABEL: Record<string, string> = {
  lead_approve: 'Confirmed by the workstream lead',
  md_approve: 'Approved for payroll',
  reject: 'Sent back',
  resubmit: 'Resubmitted',
  reopen: 'Reopened',
}
