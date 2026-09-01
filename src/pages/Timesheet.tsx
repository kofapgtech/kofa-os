import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useDecideTimesheetWeek,
  useDeleteTimeEntry,
  useEnsureTimesheetWeeks,
  useLogTime,
  useProjectBudgets,
  useTasks,
  useTimeEntries,
  useTimesheetWeeks,
} from '@/lib/queries'
import { Chip, EmptyState, PageHeader, Spinner } from '@/components/ui'
import {
  TIMESHEET_STATUS_CLASS,
  TIMESHEET_STATUS_LABEL,
  hours,
  minutesToHours,
  shortDate,
} from '@/lib/format'
import type { TimesheetWeekRow } from '@/lib/types'

function mondayOf(date: Date) {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

/** YYYY-MM-DD from a local Date, without the timezone shift toISOString()
 *  would apply. This is what timesheet_weeks.week_start is keyed on. */
function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** A week that has left the person's hands: its hours are evidence in an
 *  approval, so nothing in it can be edited or deleted until an approver
 *  sends it back. */
function isLocked(status: TimesheetWeekRow['status']) {
  return status === 'pending_lead' || status === 'pending_md' || status === 'approved'
}

export function Timesheet() {
  const { profile } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const [adding, setAdding] = useState(false)

  const weekStart = useMemo(() => {
    const d = mondayOf(new Date())
    d.setDate(d.getDate() + weekOffset * 7)
    return d
  }, [weekOffset])

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    return d
  }, [weekStart])

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        return d
      }),
    [weekStart],
  )

  const { data: entries = [], isLoading } = useTimeEntries({
    userId: profile?.user_id,
    since: weekStart.toISOString(),
  })
  const { data: projects = [] } = useProjectBudgets()
  const { data: tasks = [] } = useTasks()
  const remove = useDeleteTimeEntry()

  // Contractors' weeks go through lead -> MD -> payroll. ensure() is the
  // idempotent housekeeping that creates the week rows and auto-submits any
  // week that has finished, so nobody has to remember to press submit.
  const isContractor = profile?.employment_type === 'contractor'
  useEnsureTimesheetWeeks(isContractor)
  const { data: myWeeks = [] } = useTimesheetWeeks({ userId: profile?.user_id })

  const weekKey = dateKey(weekStart)
  const weekApprovals = useMemo(
    () => myWeeks.filter((w) => w.week_start === weekKey),
    [myWeeks, weekKey],
  )

  /** Which workstream an entry's hours are approved under: the task's, or —
   *  for time logged with no task — the person's own. Mirrors the same
   *  coalesce the database does in v_time_entry_weeks. */
  function entryDepartment(taskId: string | null) {
    return tasks.find((t) => t.id === taskId)?.department_id ?? profile?.department_id ?? null
  }

  function lockedFor(taskId: string | null) {
    const dept = entryDepartment(taskId)
    const row = weekApprovals.find((w) => (w.department_id ?? null) === dept)
    return row ? isLocked(row.status) : false
  }

  const weekEntries = entries.filter((e) => new Date(e.started_at) < weekEnd)

  // Grid: one row per project/task pair, one column per weekday.
  const rows = useMemo(() => {
    const map = new Map<string, { projectId: string; taskId: string | null; cells: number[] }>()
    weekEntries.forEach((e) => {
      const key = `${e.project_id}::${e.task_id ?? '-'}`
      const row = map.get(key) ?? { projectId: e.project_id, taskId: e.task_id, cells: Array(7).fill(0) }
      const dayIndex = Math.floor(
        (new Date(e.started_at).setHours(0, 0, 0, 0) - weekStart.getTime()) / 86_400_000,
      )
      if (dayIndex >= 0 && dayIndex < 7) row.cells[dayIndex] += minutesToHours(e.duration_minutes)
      map.set(key, row)
    })
    return [...map.values()]
  }, [weekEntries, weekStart])

  const dayTotals = days.map((_, i) => rows.reduce((s, r) => s + r.cells[i], 0))
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0)
  const billable = weekEntries
    .filter((e) => e.is_billable)
    .reduce((s, e) => s + minutesToHours(e.duration_minutes), 0)

  const projectName = (id: string) => projects.find((p) => p.project_id === id)?.name ?? 'Unknown'
  const taskName = (id: string | null) => tasks.find((t) => t.id === id)?.title ?? 'No task'

  if (isLoading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Timesheet"
        subtitle={`${shortDate(weekStart.toISOString())} – ${shortDate(
          new Date(weekEnd.getTime() - 86_400_000).toISOString(),
        )} · ${hours(weekTotal)} logged, ${hours(billable)} billable`}
        actions={
          <>
            <button className="btn-ghost !px-2.5" onClick={() => setWeekOffset((w) => w - 1)}>
              <ChevronLeft size={16} />
            </button>
            <button className="btn-ghost" onClick={() => setWeekOffset(0)}>
              This week
            </button>
            <button className="btn-ghost !px-2.5" onClick={() => setWeekOffset((w) => w + 1)}>
              <ChevronRight size={16} />
            </button>
            <button className="btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Log time
            </button>
          </>
        }
      />

      {weekApprovals.length > 0 && (
        <ApprovalStrip rows={weekApprovals} canResubmit={profile?.user_id} />
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No time logged this week."
          hint="Use the timer in the header, or log an entry manually."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-cream-300 bg-cream-100">
                <tr>
                  <th className="th">Project / task</th>
                  {days.map((d) => (
                    <th key={d.toISOString()} className="th text-center">
                      {d.toLocaleDateString('en-US', { weekday: 'short' })}
                      <span className="block font-normal text-ink-400">{d.getDate()}</span>
                    </th>
                  ))}
                  <th className="th text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {rows.map((r) => {
                  const total = r.cells.reduce((a, b) => a + b, 0)
                  return (
                    <tr key={`${r.projectId}-${r.taskId}`} className="hover:bg-cream-100">
                      <td className="td">
                        <span className="block font-medium text-ink-900">{taskName(r.taskId)}</span>
                        <span className="block text-xs text-ink-500">{projectName(r.projectId)}</span>
                      </td>
                      {r.cells.map((c, i) => (
                        <td key={i} className="td text-center tabular-nums">
                          {c > 0 ? c.toFixed(2) : <span className="text-ink-300">—</span>}
                        </td>
                      ))}
                      <td className="td text-right font-semibold tabular-nums">{total.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-cream-300 bg-cream-100">
                <tr>
                  <td className="td font-semibold">Daily total</td>
                  {dayTotals.map((t, i) => (
                    <td key={i} className="td text-center font-semibold tabular-nums">
                      {t > 0 ? t.toFixed(2) : '—'}
                    </td>
                  ))}
                  <td className="td text-right font-bold tabular-nums">{weekTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Entries this week
        </p>
        <div className="card divide-y divide-cream-200">
          {weekEntries.slice(0, 40).map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">
                  {taskName(e.task_id)}
                  {!e.is_billable && (
                    <span className="ml-2 chip bg-cream-200 text-ink-600">Internal</span>
                  )}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {projectName(e.project_id)} · {shortDate(e.started_at)}
                  {e.description ? ` · ${e.description}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold tabular-nums">
                  {minutesToHours(e.duration_minutes).toFixed(2)}h
                </span>
                {lockedFor(e.task_id) ? (
                  <span
                    className="text-ink-300"
                    title="This week is in approval — its time can't be changed"
                  >
                    <Lock size={15} />
                  </span>
                ) : (
                  <button
                    className="text-ink-400 hover:text-rose-600"
                    title="Delete entry"
                    onClick={() => remove.mutate(e.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {weekEntries.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-500">Nothing logged yet.</p>
          )}
        </div>
      </div>

      {adding && <LogTimeDialog onClose={() => setAdding(false)} />}
    </div>
  )
}

/** Where this week stands, one card per workstream the person logged against.
 *  A returned week is the only one that needs an action from them, so it is
 *  the only one with a button. */
function ApprovalStrip({
  rows,
  canResubmit,
}: {
  rows: TimesheetWeekRow[]
  canResubmit: string | undefined
}) {
  const decide = useDecideTimesheetWeek()

  return (
    <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((w) => (
        <div key={w.id} className="card p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">
                {w.department_name ?? 'No workstream'}
              </p>
              <p className="text-xs text-ink-500">
                {minutesToHours(w.total_minutes).toFixed(2)}h · {w.entry_count} entr
                {w.entry_count === 1 ? 'y' : 'ies'}
              </p>
            </div>
            <Chip className={TIMESHEET_STATUS_CLASS[w.status]}>
              {w.paid_at ? 'Paid' : TIMESHEET_STATUS_LABEL[w.status]}
            </Chip>
          </div>

          {w.status === 'rejected' && (
            <div className="mt-2.5 rounded-lg bg-rose-50 p-2.5">
              <p className="text-xs text-rose-800">
                {w.rejection_comment ?? 'Sent back for changes.'}
              </p>
              {w.rejected_by_name && (
                <p className="mt-1 text-[11px] text-rose-600">— {w.rejected_by_name}</p>
              )}
              {canResubmit === w.user_id && (
                <button
                  className="btn-ghost mt-2 !py-1 !text-xs"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ weekId: w.id, decision: 'resubmit' })}
                >
                  <RotateCcw size={13} /> Fixed — resubmit
                </button>
              )}
            </div>
          )}

          {w.status === 'pending_md' && w.lead_approved_by_name && (
            <p className="mt-2 text-xs text-ink-500">Approved by {w.lead_approved_by_name}</p>
          )}
          {w.status === 'approved' && (
            <p className="mt-2 text-xs text-ink-500">
              Cleared for payroll{w.md_approved_by_name ? ` by ${w.md_approved_by_name}` : ''}
            </p>
          )}
          {isLocked(w.status) && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-400">
              <Lock size={11} /> Locked while it is being reviewed
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function LogTimeDialog({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
  const log = useLogTime()
  const { data: projects = [] } = useProjectBudgets()
  const { data: tasks = [] } = useTasks()

  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [duration, setDuration] = useState('1')
  const [note, setNote] = useState('')
  const [billable, setBillable] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const projectTasks = tasks.filter((t) => t.project_id === projectId)

  async function submit() {
    setError(null)
    // Anchor manual entries at 09:00 local so they land on the right day.
    const start = new Date(`${date}T09:00:00`)
    const end = new Date(start.getTime() + Number(duration) * 3_600_000)
    try {
      await log.mutateAsync({
        org_id: profile!.org_id,
        project_id: projectId,
        task_id: taskId || null,
        user_id: profile!.user_id,
        started_at: start.toISOString(),
        ended_at: end.toISOString(),
        description: note || null,
        is_billable: billable,
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-brand-800/30" onClick={onClose} />
      <div className="relative w-full max-w-md card p-5">
        <p className="mb-4 text-sm font-semibold">Log time</p>
        <div className="space-y-3">
          <div>
            <label className="label">Project</label>
            <select
              className="input"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value)
                setTaskId('')
                const p = projects.find((x) => x.project_id === e.target.value)
                if (p) setBillable(true)
              }}
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {projectId && (
            <div>
              <label className="label">Task</label>
              <select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">No specific task</option>
                {projectTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Hours</label>
              <input
                className="input"
                type="number"
                min="0.25"
                step="0.25"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-cream-400"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
            />
            Billable
          </label>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button className="btn-ghost flex-1" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary flex-1"
              disabled={!projectId || !duration || log.isPending}
              onClick={() => void submit()}
            >
              Log time
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
