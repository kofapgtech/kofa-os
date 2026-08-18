import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Lock } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  useDeliverables,
  useProfiles,
  useProjectBudget,
  useTaskHours,
  useTasks,
  useTimeEntries,
} from '@/lib/queries'
import { useAuth } from '@/contexts/AuthContext'
import { TaskViews } from '@/components/TaskViews'
import { DeliverablePanel } from '@/components/DeliverablePanel'
import { BurnBar, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui'
import {
  PROJECT_STATUS_CLASS,
  PROJECT_STATUS_LABEL,
  STAGE_CLASS,
  STAGE_LABEL,
  hours,
  longDate,
  minutesToHours,
  money,
  shortDate,
} from '@/lib/format'
import type { Deliverable } from '@/lib/types'

type Tab = 'tasks' | 'time' | 'deliverables' | 'budget'

export function ProjectDetail() {
  const { projectId } = useParams()
  const { isLeadership } = useAuth()
  const [tab, setTab] = useState<Tab>('tasks')

  const { data: budget, isLoading } = useProjectBudget(projectId)
  const { data: tasks = [] } = useTasks(projectId)
  const { data: people = [] } = useProfiles()
  const { data: hoursByTask = {} } = useTaskHours(projectId)
  const { data: entries = [] } = useTimeEntries({ projectId })
  const { data: deliverables = [] } = useDeliverables(projectId)

  if (isLoading) return <Spinner />
  if (!budget) return <EmptyState title="Project not found." />

  const tabs: [Tab, string, number | null][] = [
    ['tasks', 'Tasks', tasks.filter((t) => t.status !== 'done').length],
    ['time', 'Time', entries.length],
    ['deliverables', 'Deliverables', deliverables.length],
    ['budget', 'Budget', null],
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
            {budget.account_name} · {budget.department_name ?? 'No department'} ·{' '}
            {budget.start_date ? longDate(budget.start_date) : '—'} → {longDate(budget.due_date)}
          </>
        }
        actions={
          <span className={`chip ${PROJECT_STATUS_CLASS[budget.status]}`}>
            {PROJECT_STATUS_LABEL[budget.status]}
          </span>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hours logged"
          value={hours(budget.total_hours)}
          sub={`of ${budget.budget_hours}h budgeted · ${hours(budget.billable_hours)} billable`}
        />
        <StatCard
          label="Spend to date"
          value={money(budget.accrued_amount)}
          sub={isLeadership ? `of ${money(budget.budget_amount)} budget` : 'Restricted'}
          icon={isLeadership ? undefined : <Lock size={14} />}
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
            budget.projected_amount !== null && budget.projected_amount > budget.budget_amount * 1.05
              ? 'text-rose-600'
              : 'text-ink-900'
          }
          sub={
            budget.projected_amount === null
              ? 'Restricted'
              : budget.projected_amount > budget.budget_amount * 1.05
                ? `${money(budget.projected_amount - budget.budget_amount)} over budget`
                : 'On track'
          }
        />
      </div>

      <div className="mb-5 card p-4">
        <BurnBar percent={isLeadership ? budget.pct_amount : budget.pct_hours} />
      </div>

      <div className="mb-4 flex gap-1 border-b border-cream-300">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {label}
            {count !== null && <span className="ml-1.5 text-xs text-ink-400">{count}</span>}
          </button>
        ))}
      </div>

      {tab === 'tasks' && (
        <TaskViews tasks={tasks} people={people} hoursByTask={hoursByTask} projectId={projectId} />
      )}
      {tab === 'time' && <TimeTab entries={entries} people={people} tasks={tasks} />}
      {tab === 'deliverables' && (
        <DeliverablesTab deliverables={deliverables} people={people} projectName={budget.name} />
      )}
      {tab === 'budget' && <BudgetTab projectId={projectId!} />}
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
  const nameOf = (id: string) => people.find((p) => p.id === id)?.full_name ?? 'Unknown'
  const taskOf = (id: string | null) => tasks.find((t) => t.id === id)?.title ?? '—'

  if (entries.length === 0) return <EmptyState title="No time logged against this project yet." />

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-cream-300 bg-cream-100">
            <tr>
              <th className="th">Date</th>
              <th className="th">Person</th>
              <th className="th">Task</th>
              <th className="th">Note</th>
              <th className="th">Billable</th>
              <th className="th text-right">Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200">
            {entries.slice(0, 200).map((e) => (
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
  projectName,
}: {
  deliverables: Deliverable[]
  people: import('@/lib/types').Profile[]
  projectName: string
}) {
  const [open, setOpen] = useState<Deliverable | null>(null)
  if (deliverables.length === 0) return <EmptyState title="No deliverables on this project yet." />

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {deliverables.map((d) => (
          <button key={d.id} onClick={() => setOpen(d)} className="card p-4 text-left hover:border-brand-300">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-ink-900">{d.title}</p>
              <span className={`chip shrink-0 ${STAGE_CLASS[d.stage]}`}>{STAGE_LABEL[d.stage]}</span>
            </div>
            <p className="mt-2 text-xs text-ink-500">
              v{d.version} · due {shortDate(d.due_date)}
            </p>
          </button>
        ))}
      </div>
      {open && (
        <DeliverablePanel
          deliverable={open}
          people={people}
          projectName={projectName}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

/** Burn-up over time plus a breakdown of where the hours went. */
function BudgetTab({ projectId }: { projectId: string }) {
  const { isLeadership } = useAuth()
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
        name: people.find((p) => p.id === id)?.full_name.split(' ')[0] ?? 'Unknown',
        hours: Math.round(h * 10) / 10,
      }))
      .sort((a, b) => b.hours - a.hours)
  }, [entries, people])

  if (!budget) return <Spinner />

  return (
    <div className="space-y-4">
      {!isLeadership && (
        <p className="flex items-center gap-2 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2.5 text-sm text-ink-600">
          <Lock size={15} /> Rates and margin are restricted to leadership. Hours are shown in full.
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
              <ReferenceLine
                y={budget.budget_hours}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                label={{ value: 'Budget', position: 'insideTopRight', fill: '#f43f5e', fontSize: 11 }}
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
    </div>
  )
}
