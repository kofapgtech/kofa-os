import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Lock, Pencil, Plus } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  useApproveMonthlyBudget,
  useDecideWorkstreamBudgetRequest,
  useDeliverableAttachmentCounts,
  useDeliverables,
  useDepartments,
  useProfiles,
  useProjectBudget,
  useProjectMonthlyBudgets,
  useSetProjectMonthlyBudgets,
  useSetWorkstreamBudgets,
  useTaskHours,
  useTasks,
  useTimeEntries,
  useUnapproveMonthlyBudget,
  useVisibleProjectIds,
  useWorkstreamBudgetRequests,
  useWorkstreamBudgets,
} from '@/lib/queries'
import { useAuth } from '@/contexts/AuthContext'
import { TaskViews } from '@/components/TaskViews'
import { DeliverablePanel } from '@/components/DeliverablePanel'
import { DeliverableCard } from '@/components/DeliverableCard'
import { NewDeliverableModal } from '@/components/DeliverableForm'
import { EditProjectModal } from '@/pages/Projects'
import { BurnBar, EmptyState, PageHeader, SortableTh, Spinner, StatCard, sortRows, useTableSort } from '@/components/ui'
import {
  PROJECT_STATUS_CLASS,
  PROJECT_STATUS_LABEL,
  hours,
  longDate,
  minutesToHours,
  money,
  shortDate,
} from '@/lib/format'
import type {
  Deliverable,
  ProjectBudget,
  ProjectMonthlyBudgetRow,
  TaskTimeRequestStatus,
} from '@/lib/types'

type Tab = 'tasks' | 'time' | 'deliverables' | 'budget'

const TAB_VALUES: Tab[] = ['tasks', 'time', 'deliverables', 'budget']

export function ProjectDetail() {
  const { projectId } = useParams()
  const { hasFinancialAccess, isAdminOrExecutive } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // A notification click can deep-link here with ?tab=budget&task=<id>,
  // &request=<id>, or &deliverable=<id>. Capture that on mount, then strip
  // it from the URL so a later refresh or back-navigation doesn't reopen
  // the same drawer/tab.
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab')
    return (TAB_VALUES as string[]).includes(t ?? '') ? (t as Tab) : 'tasks'
  })
  const [openTaskId] = useState(() => searchParams.get('task') ?? undefined)
  const [highlightRequestId] = useState(() => searchParams.get('request') ?? undefined)
  const [openDeliverableId] = useState(() => searchParams.get('deliverable') ?? undefined)
  const [editingProject, setEditingProject] = useState(false)

  useEffect(() => {
    if (
      !searchParams.get('tab') &&
      !searchParams.get('task') &&
      !searchParams.get('request') &&
      !searchParams.get('deliverable')
    )
      return
    const next = new URLSearchParams(searchParams)
    next.delete('tab')
    next.delete('task')
    next.delete('request')
    next.delete('deliverable')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: budget, isLoading } = useProjectBudget(projectId)
  const { data: tasks = [] } = useTasks(projectId)
  const { data: people = [] } = useProfiles()
  const { data: hoursByTask = {} } = useTaskHours(projectId)
  const { data: entries = [] } = useTimeEntries({ projectId })
  const { data: deliverables = [] } = useDeliverables(projectId)

  // A contractor only gets the projects they hold a task on. The Projects
  // grid is already filtered, so this closes the direct-URL route into one
  // they aren't on — a stale bookmark, or a link pasted by a teammate.
  // Waiting out isLoading matters: acting on an unresolved scope would bounce
  // them off a project they're entitled to.
  const scope = useVisibleProjectIds()
  const outOfScope = scope.scoped && !scope.isLoading && !!scope.ids && !scope.ids.has(projectId ?? '')

  if (isLoading || scope.isLoading) return <Spinner />
  if (outOfScope) return <Navigate to="/projects" replace />
  if (!budget) return <EmptyState title="Project not found." />

  // An untracked project (internal account, no budget) has no monthly split to
  // plan, so the Budget tab goes away entirely rather than rendering an empty
  // planner. A deep link to ?tab=budget falls back to Tasks.
  const isUntracked = budget.budget_amount === null
  const activeTab: Tab = isUntracked && tab === 'budget' ? 'tasks' : tab

  const tabs: [Tab, string, number | null][] = [
    ['tasks', 'Tasks', tasks.filter((t) => t.status !== 'done').length],
    ['time', 'Time', entries.length],
    ['deliverables', 'Deliverables', deliverables.length],
    ...(isUntracked ? [] : ([['budget', 'Budget', null]] as [Tab, string, number | null][])),
  ]

  return (
    <div>
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft size={15} /> All projects
      </Link>

      <PageHeader
        title={budget.name}
        subtitle={
          <>
            {budget.account_name} · {budget.start_date ? longDate(budget.start_date) : '—'}
            {budget.length_months === null ? (
              ' · open-ended'
            ) : (
              <>
                {' → '}
                {budget.target_end_date ? longDate(budget.target_end_date) : '—'} · {budget.length_months}{' '}
                {budget.length_months === 1 ? 'month' : 'months'}
              </>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-1.5">
            {budget.budget_amount === null && (
              <span className="chip bg-brand-100 text-brand-700">Internal · no budget</span>
            )}
            <span className={`chip ${PROJECT_STATUS_CLASS[budget.status]}`}>
              {PROJECT_STATUS_LABEL[budget.status]}
            </span>
            {isAdminOrExecutive && (
              <button
                type="button"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-brand-50 hover:text-brand-600"
                onClick={() => setEditingProject(true)}
                title="Edit project"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
        }
      />
      {editingProject && <EditProjectModal project={budget} onClose={() => setEditingProject(false)} />}

      {isUntracked ? (
        /* No budget to burn against, so the money panel becomes what actually
           means something internally: hours in, and what those hours cost. */
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Hours logged"
            value={hours(budget.total_hours)}
            sub={`${hours(budget.billable_hours)} billable`}
          />
          <StatCard
            label="Internal cost"
            value={hasFinancialAccess ? money(budget.accrued_cost) : '—'}
            sub={hasFinancialAccess ? 'Hours × pay rate' : 'Restricted'}
            icon={hasFinancialAccess ? undefined : <Lock size={14} />}
          />
          <StatCard
            label="Open tasks"
            value={String(tasks.filter((t) => t.status !== 'done').length)}
            sub={`of ${tasks.length}`}
          />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Hours logged"
              value={hours(budget.total_hours)}
              sub={`${hours(budget.billable_hours)} billable`}
            />
            <StatCard
              label="Spend to date"
              value={money(budget.accrued_amount)}
              sub={hasFinancialAccess ? `of ${money(budget.budget_amount)} budget` : 'Restricted'}
              icon={hasFinancialAccess ? undefined : <Lock size={14} />}
            />
            <StatCard
              label="Remaining"
              value={money(budget.remaining_amount)}
              tone={
                budget.remaining_amount !== null && budget.remaining_amount < 0
                  ? 'text-rose-600'
                  : 'text-ink-900'
              }
              sub={budget.margin_pct !== null ? `${budget.margin_pct}% margin` : 'Restricted'}
            />
            <StatCard
              label="Projected at this burn"
              value={money(budget.projected_amount)}
              tone={
                budget.projected_amount !== null &&
                budget.budget_amount !== null &&
                budget.projected_amount > budget.budget_amount * 1.05
                  ? 'text-rose-600'
                  : 'text-ink-900'
              }
              sub={
                budget.projected_amount === null || budget.budget_amount === null
                  ? 'Restricted'
                  : budget.projected_amount > budget.budget_amount * 1.05
                    ? `${money(budget.projected_amount - budget.budget_amount)} over budget`
                    : 'On track'
              }
            />
          </div>

          <div className="mb-5 card p-4">
            <BurnBar percent={budget.pct_amount} />
          </div>
        </>
      )}

      <div className="mb-4 flex gap-1 border-b border-cream-300">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {label}
            {count !== null && <span className="ml-1.5 text-xs text-ink-400">{count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'tasks' && (
        <TaskViews
          tasks={tasks}
          people={people}
          hoursByTask={hoursByTask}
          projectId={projectId}
          openTaskId={openTaskId}
        />
      )}
      {activeTab === 'time' && <TimeTab entries={entries} people={people} tasks={tasks} />}
      {activeTab === 'deliverables' && (
        <DeliverablesTab
          deliverables={deliverables}
          people={people}
          projectId={projectId!}
          projectName={budget.name}
          openDeliverableId={openDeliverableId}
        />
      )}
      {activeTab === 'budget' && <BudgetTab projectId={projectId!} highlightRequestId={highlightRequestId} />}
    </div>
  )
}

// --------------------------------------------------------------------- tabs

function TimeTab({
  entries,
  people,
  tasks,
}: {
  entries: import('@/lib/types').TimeEntry[]
  people: import('@/lib/types').Profile[]
  tasks: import('@/lib/types').Task[]
}) {
  const nameOf = (id: string) => people.find((p) => p.user_id === id)?.full_name ?? 'Unknown'
  const taskOf = (id: string | null) => tasks.find((t) => t.id === id)?.title ?? '—'
  const sort = useTableSort<'date' | 'person' | 'task' | 'note' | 'billable' | 'hours'>()

  const sorted = sortRows(entries, sort.sortKey, sort.sortDir, (e, key) => {
    switch (key) {
      case 'date':
        return e.started_at
      case 'person':
        return nameOf(e.user_id).toLowerCase()
      case 'task':
        return taskOf(e.task_id).toLowerCase()
      case 'note':
        return e.description?.toLowerCase() ?? null
      case 'billable':
        return e.is_billable
      case 'hours':
        return e.duration_minutes
      default:
        return null
    }
  })

  if (entries.length === 0) return <EmptyState title="No time logged against this project yet." />

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-cream-300 bg-cream-100">
            <tr>
              <SortableTh label="Date" sortKey="date" sort={sort} />
              <SortableTh label="Person" sortKey="person" sort={sort} />
              <SortableTh label="Task" sortKey="task" sort={sort} />
              <SortableTh label="Note" sortKey="note" sort={sort} />
              <SortableTh label="Billable" sortKey="billable" sort={sort} />
              <SortableTh label="Hours" sortKey="hours" sort={sort} align="right" className="text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200">
            {sorted.slice(0, 200).map((e) => (
              <tr key={e.id} className="hover:bg-cream-100">
                <td className="td whitespace-nowrap">{shortDate(e.started_at)}</td>
                <td className="td">{nameOf(e.user_id)}</td>
                <td className="td">{taskOf(e.task_id)}</td>
                <td className="td text-ink-500">{e.description ?? '—'}</td>
                <td className="td">
                  <span className={`chip ${e.is_billable ? 'bg-brand-100 text-brand-700' : 'bg-cream-200 text-ink-600'}`}>
                    {e.is_billable ? 'Billable' : 'Internal'}
                  </span>
                </td>
                <td className="td text-right tabular-nums">{minutesToHours(e.duration_minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DeliverablesTab({
  deliverables,
  people,
  projectId,
  projectName,
  openDeliverableId,
}: {
  deliverables: Deliverable[]
  people: import('@/lib/types').Profile[]
  projectId: string
  projectName: string
  /** Deep-link from a notification: open this deliverable's panel once it's loaded. */
  openDeliverableId?: string
}) {
  const [open, setOpen] = useState<Deliverable | null>(null)
  const [creating, setCreating] = useState(false)
  const { data: attachmentCounts = {} } = useDeliverableAttachmentCounts()

  useEffect(() => {
    if (!openDeliverableId) return
    const target = deliverables.find((d) => d.id === openDeliverableId)
    if (target) setOpen(target)
  }, [openDeliverableId, deliverables])

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> New deliverable
        </button>
      </div>

      {deliverables.length === 0 ? (
        <EmptyState title="No deliverables on this project yet." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {deliverables.map((d) => (
            <DeliverableCard
              key={d.id}
              deliverable={d}
              people={people}
              attachmentCount={attachmentCounts[d.id] ?? 0}
              onClick={() => setOpen(d)}
            />
          ))}
        </div>
      )}

      {open && (
        <DeliverablePanel
          deliverable={open}
          people={people}
          projectName={projectName}
          onClose={() => setOpen(null)}
        />
      )}

      {creating && (
        <NewDeliverableModal projectId={projectId} people={people} onClose={() => setCreating(false)} />
      )}
    </>
  )
}

/** Burn-up over time, hours by person, plus the monthly-budget / workstream
 *  planning workspace (below the charts). */
function BudgetTab({
  projectId,
  highlightRequestId,
}: {
  projectId: string
  highlightRequestId?: string
}) {
  const { hasFinancialAccess } = useAuth()
  const { data: budget } = useProjectBudget(projectId)
  const { data: entries = [] } = useTimeEntries({ projectId })
  const { data: people = [] } = useProfiles()

  const burnUp = useMemo(() => {
    const byDay = new Map<string, number>()
    entries.forEach((e) => {
      const day = e.started_at.slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + minutesToHours(e.duration_minutes))
    })
    let running = 0
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, h]) => {
        running += h
        return { day: shortDate(day), cumulative: Math.round(running * 10) / 10 }
      })
  }, [entries])

  const byPerson = useMemo(() => {
    const map = new Map<string, number>()
    entries.forEach((e) => map.set(e.user_id, (map.get(e.user_id) ?? 0) + minutesToHours(e.duration_minutes)))
    return [...map.entries()]
      .map(([id, h]) => ({
        name: people.find((p) => p.user_id === id)?.full_name.split(' ')[0] ?? 'Unknown',
        hours: Math.round(h * 10) / 10,
      }))
      .sort((a, b) => b.hours - a.hours)
  }, [entries, people])

  if (!budget) return <Spinner />

  return (
    <div className="space-y-4">
      {!hasFinancialAccess && (
        <p className="flex items-center gap-2 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2.5 text-sm text-ink-600">
          <Lock size={15} /> Rates, monthly budgets, and margin are restricted to leadership. Hours are shown in full.
        </p>
      )}

      <div className="card p-4">
        <p className="mb-3 text-sm font-semibold text-ink-900">Hours burned over time</p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={burnUp} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E9DFCE" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6A6458' }} minTickGap={28} />
              <YAxis tick={{ fontSize: 11, fill: '#6A6458' }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #E9DFCE', fontSize: 12 }}
                formatter={(v) => [`${v}h`, 'Cumulative']}
              />
              <Area type="monotone" dataKey="cumulative" stroke="#2E5C41" fill="#B9D6C5" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-4">
        <p className="mb-3 text-sm font-semibold text-ink-900">Hours by person</p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byPerson} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E9DFCE" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6A6458' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6A6458' }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #E9DFCE', fontSize: 12 }}
                formatter={(v) => [`${v}h`, 'Logged']}
              />
              <Bar dataKey="hours" fill="#367A57" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {hasFinancialAccess && (
        <>
          <MonthlyBudgetPlanner projectId={projectId} budget={budget} />
          <WorkstreamBudgetRequestsPanel projectId={projectId} highlightRequestId={highlightRequestId} />
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------- monthly budgeting

function addMonths(monthStr: string, n: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

function monthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const REQUEST_STATUS_LABEL: Record<TaskTimeRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
}
const REQUEST_STATUS_CLASS: Record<TaskTimeRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  denied: 'bg-rose-100 text-rose-700',
}

/** The MD's monthly split of the project's overall budget_amount, plus, for
 *  each approved month, the workstream allocation editor. Amounts here must
 *  always sum to budget_amount — the RPC enforces it server-side too. */
function MonthlyBudgetPlanner({ projectId, budget }: { projectId: string; budget: ProjectBudget }) {
  const { isAdminOrExecutive } = useAuth()
  const { data: monthRows = [] } = useProjectMonthlyBudgets(projectId)
  const setMonths = useSetProjectMonthlyBudgets()
  const approveMonth = useApproveMonthlyBudget()
  const unapproveMonth = useUnapproveMonthlyBudget()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  // Both are nullable on an untracked (internal) project, but the Budget tab
  // isn't rendered for one at all — see isUntracked in ProjectDetail. Narrowing
  // here keeps the arithmetic below honest without threading a guard through it.
  const totalBudget = budget.budget_amount ?? 0
  const plannedLength = budget.length_months ?? 0

  const byMonth = useMemo(() => new Map(monthRows.map((r) => [r.month, r])), [monthRows])
  const currentMonthCutoff = new Date().toISOString().slice(0, 7) + '-01'
  const isPastMonth = (m: string) => m < currentMonthCutoff

  const plannedMonths = useMemo(() => {
    const list: string[] = []
    if (budget.start_date) {
      const base = budget.start_date.slice(0, 7) + '-01'
      for (let i = 0; i < plannedLength; i++) list.push(addMonths(base, i))
    }
    const inWindow = new Set(list)
    monthRows.forEach((r) => {
      // Editing a project's start date or length can leave behind draft
      // month rows outside the new window — don't resurrect those stale
      // placeholders. Approved months always stay visible, though: that's
      // real committed money and shouldn't silently disappear from view.
      if (!inWindow.has(r.month) && r.status === 'approved' && !list.includes(r.month)) {
        list.push(r.month)
      }
    })
    return list.sort()
  }, [budget.start_date, plannedLength, monthRows])

  const draftMonths = plannedMonths.filter((m) => byMonth.get(m)?.status !== 'approved')
  const approvedTotal = monthRows
    .filter((r) => r.status === 'approved')
    .reduce((s, r) => s + r.amount, 0)

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev }
      let changed = false
      draftMonths.forEach((m) => {
        if (next[m] === undefined) {
          const existing = byMonth.get(m)
          next[m] = existing ? String(existing.amount) : ''
          changed = true
        }
      })
      Object.keys(next).forEach((k) => {
        if (!draftMonths.includes(k)) {
          delete next[k]
          changed = true
        }
      })
      return changed ? next : prev
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })
  }, [draftMonths.join(',')])

  function distributeEvenly() {
    const futureDraftMonths = draftMonths.filter((m) => !isPastMonth(m))
    const pastDraftTotal = draftMonths
      .filter((m) => isPastMonth(m))
      .reduce((s, m) => s + (Number(drafts[m]) || 0), 0)
    const remaining = totalBudget - approvedTotal - pastDraftTotal
    const n = futureDraftMonths.length
    if (n === 0) return
    const base = Math.floor((remaining / n) * 100) / 100
    const next: Record<string, string> = { ...drafts }
    futureDraftMonths.forEach((m, i) => {
      next[m] = i === n - 1 ? (remaining - base * (n - 1)).toFixed(2) : base.toFixed(2)
    })
    setDrafts(next)
  }

  const draftTotal = draftMonths.reduce((s, m) => s + (Number(drafts[m]) || 0), 0)
  const grandTotal = approvedTotal + draftTotal
  const diff = Math.round((totalBudget - grandTotal) * 100) / 100

  function save() {
    const entries = draftMonths
      .filter((m) => !isPastMonth(m))
      .map((m) => ({ month: m, amount: Number(drafts[m]) || 0 }))
    setMonths.mutate({ projectId, entries })
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">Monthly budget</p>
        <p className={`text-xs font-medium ${diff === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
          {money(grandTotal)} of {money(totalBudget)} planned
          {diff !== 0 && ` · ${diff > 0 ? `${money(diff)} unallocated` : `${money(-diff)} over`}`}
        </p>
      </div>

      {plannedMonths.length === 0 ? (
        <EmptyState title="Set a start date on this project to plan monthly budgets." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-cream-300">
                <tr>
                  <th className="th">Month</th>
                  <th className="th text-right">Amount</th>
                  <th className="th text-right">Allocated</th>
                  <th className="th">Status</th>
                  {isAdminOrExecutive && <th className="th" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {plannedMonths.map((m) => {
                  const row = byMonth.get(m)
                  const isApproved = row?.status === 'approved'
                  return (
                    <Fragment key={m}>
                      <tr className="hover:bg-cream-100">
                        <td className="td font-medium text-ink-900">{monthLabel(m)}</td>
                        <td className="td text-right tabular-nums">
                          {isApproved || !isAdminOrExecutive || isPastMonth(m) ? (
                            money(row?.amount ?? Number(drafts[m]) ?? 0)
                          ) : (
                            <input
                              className="input !w-28 text-right"
                              type="number"
                              min="0"
                              step="0.01"
                              value={drafts[m] ?? ''}
                              onChange={(e) => setDrafts((d) => ({ ...d, [m]: e.target.value }))}
                            />
                          )}
                        </td>
                        <td className="td text-right tabular-nums text-ink-500">
                          {row ? money(row.allocated_to_workstreams) : '—'}
                        </td>
                        <td className="td">
                          <span
                            className={`chip ${isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-cream-200 text-ink-600'}`}
                          >
                            {isApproved ? 'Approved' : 'Draft'}
                          </span>
                        </td>
                        {isAdminOrExecutive && (
                          <td className="td text-right">
                            <div className="flex justify-end gap-1.5">
                              {row && (
                                <button
                                  className="btn-ghost !py-1 !px-2.5 text-xs"
                                  onClick={() => setExpanded(expanded === m ? null : m)}
                                >
                                  {expanded === m ? 'Hide' : 'Allocate'}
                                </button>
                              )}
                              {isApproved ? (
                                isPastMonth(m) ? (
                                  <span
                                    className="chip bg-cream-200 text-ink-600"
                                    title="This month has ended and can no longer be reopened."
                                  >
                                    Locked
                                  </span>
                                ) : (
                                  <button
                                    className="btn-ghost !py-1 !px-2.5 text-xs"
                                    onClick={() => unapproveMonth.mutate({ id: row!.id, projectId })}
                                  >
                                    Reopen
                                  </button>
                                )
                              ) : row ? (
                                <button
                                  className="btn-primary !py-1 !px-2.5 text-xs"
                                  onClick={() => approveMonth.mutate({ id: row.id, projectId })}
                                >
                                  Approve
                                </button>
                              ) : null}
                            </div>
                          </td>
                        )}
                      </tr>
                      {expanded === m && row && (
                        <tr>
                          <td colSpan={isAdminOrExecutive ? 5 : 4} className="bg-cream-50 p-3">
                            <WorkstreamAllocationEditor projectId={projectId} month={m} monthBudget={row} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {isAdminOrExecutive && draftMonths.some((m) => !isPastMonth(m)) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost text-xs" onClick={distributeEvenly}>
                Split evenly
              </button>
              <button className="btn-primary text-xs" onClick={save} disabled={setMonths.isPending}>
                Save changes
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** For one approved (or draft) month: which workstreams the MD has chosen
 *  for this project, how much each got, and how much of that is already
 *  committed via task_hour_allocations. */
function WorkstreamAllocationEditor({
  projectId,
  month,
  monthBudget,
}: {
  projectId: string
  month: string
  monthBudget: ProjectMonthlyBudgetRow
}) {
  const { isAdminOrExecutive } = useAuth()
  const isPastMonth = month < new Date().toISOString().slice(0, 7) + '-01'
  const canEdit = isAdminOrExecutive && !isPastMonth
  const { data: rows = [] } = useWorkstreamBudgets(projectId, month)
  const { data: departments = [] } = useDepartments()
  const setWorkstreams = useSetWorkstreamBudgets()
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [addingDept, setAddingDept] = useState('')

  useEffect(() => {
    const next: Record<string, string> = {}
    rows.forEach((r) => {
      next[r.department_id] = String(r.allocated_amount)
    })
    setEntries(next)
  }, [rows.map((r) => `${r.department_id}:${r.allocated_amount}`).join(',')])

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? 'Unknown'
  const availableDepartments = departments.filter((d) => entries[d.id] === undefined)
  const cap = monthBudget.amount
  const total = Object.values(entries).reduce((s, v) => s + (Number(v) || 0), 0)
  const over = total > cap + 0.005

  function addDept() {
    if (!addingDept) return
    setEntries((e) => ({ ...e, [addingDept]: '0' }))
    setAddingDept('')
  }

  function removeDept(id: string) {
    setEntries((e) => {
      const next = { ...e }
      delete next[id]
      return next
    })
  }

  function save() {
    const payload = Object.entries(entries)
      .filter(([, v]) => Number(v) > 0)
      .map(([department_id, v]) => ({ department_id, amount: Number(v) }))
    setWorkstreams.mutate({ projectId, month, entries: payload })
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {monthLabel(month)} · workstream allocation
      </p>
      {isAdminOrExecutive && isPastMonth && (
        <p className="text-xs text-ink-500">This month has ended — allocation is locked.</p>
      )}
      {Object.keys(entries).length === 0 ? (
        <p className="text-sm text-ink-500">No workstreams chosen for this month yet.</p>
      ) : (
        <div className="space-y-1.5">
          {Object.keys(entries).map((id) => {
            const r = rows.find((x) => x.department_id === id)
            return (
              <div
                key={id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-cream-300 bg-white px-3 py-2"
              >
                <span className="min-w-[9rem] flex-1 text-sm font-medium text-ink-900">{deptName(id)}</span>
                {canEdit ? (
                  <input
                    className="input !w-28 text-right"
                    type="number"
                    min="0"
                    step="0.01"
                    value={entries[id]}
                    onChange={(e) => setEntries((prev) => ({ ...prev, [id]: e.target.value }))}
                  />
                ) : (
                  <span className="tabular-nums text-sm">{money(Number(entries[id]))}</span>
                )}
                <span className="text-xs text-ink-500">
                  committed {money(r?.committed_amount ?? 0)} · remaining {money(r?.remaining_amount ?? Number(entries[id]))}
                </span>
                {canEdit && (
                  <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => removeDept(id)}>
                    Remove
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {canEdit && (
        <>
          {availableDepartments.length > 0 && (
            <div className="flex items-center gap-2">
              <select className="input !w-auto" value={addingDept} onChange={(e) => setAddingDept(e.target.value)}>
                <option value="">Add a workstream…</option>
                {availableDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button className="btn-ghost !py-1.5 text-xs" onClick={addDept} disabled={!addingDept}>
                Add
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className={`text-xs font-medium ${over ? 'text-rose-600' : 'text-ink-500'}`}>
              {money(total)} of {money(cap)} allocated{over && ' · exceeds this month’s budget'}
            </p>
            <button
              className="btn-primary !py-1 !px-3 text-xs"
              onClick={save}
              disabled={over || setWorkstreams.isPending}
            >
              Save allocation
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Pending (and recently decided) requests from workstream leaders for more
 *  room in a month where planned hours would otherwise overrun their
 *  budget — mirrors the existing task time-extension request pattern. */
function WorkstreamBudgetRequestsPanel({
  projectId,
  highlightRequestId,
}: {
  projectId: string
  highlightRequestId?: string
}) {
  const { isAdminOrExecutive } = useAuth()
  const { data: requests = [] } = useWorkstreamBudgetRequests(projectId)
  const { data: departments = [] } = useDepartments()
  const decide = useDecideWorkstreamBudgetRequest()

  if (requests.length === 0) return null

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? 'Unknown'
  const pending = requests.filter((r) => r.status === 'pending')
  const decided = requests.filter((r) => r.status !== 'pending').slice(0, 5)

  return (
    <div className="card p-4">
      <p className="mb-3 text-sm font-semibold text-ink-900">Budget requests</p>
      <div className="space-y-2">
        {[...pending, ...decided].map((r) => (
          <div
            key={r.id}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
              r.id === highlightRequestId ? 'border-brand-500 ring-2 ring-brand-200' : 'border-cream-300'
            }`}
          >
            <div>
              <p className="font-medium text-ink-900">
                {deptName(r.department_id)} · {monthLabel(r.month)} · {money(r.requested_amount)}
              </p>
              {r.reason && <p className="text-xs text-ink-500">{r.reason}</p>}
            </div>
            {r.status === 'pending' && isAdminOrExecutive ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  className="btn-ghost !py-1 !px-2.5 text-xs"
                  onClick={() => decide.mutate({ requestId: r.id, decision: 'deny' })}
                >
                  Deny
                </button>
                {r.month < new Date().toISOString().slice(0, 7) + '-01' ? (
                  <span
                    className="chip bg-cream-200 text-ink-600"
                    title="This month has already ended and can no longer be approved."
                  >
                    Past month
                  </span>
                ) : (
                  <button
                    className="btn-primary !py-1 !px-2.5 text-xs"
                    onClick={() => decide.mutate({ requestId: r.id, decision: 'approve' })}
                  >
                    Approve
                  </button>
                )}
              </div>
            ) : (
              <span className={`chip shrink-0 ${REQUEST_STATUS_CLASS[r.status]}`}>
                {REQUEST_STATUS_LABEL[r.status]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
