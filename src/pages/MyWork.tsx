import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, FileCheck2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTimer } from '@/contexts/TimerContext'
import {
  useDeliverables,
  useProfiles,
  useProjectBudgets,
  useTaskHours,
  useTasks,
  useTimeEntries,
} from '@/lib/queries'
import { TaskViews } from '@/components/TaskViews'
import { EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui'
import { STAGE_CLASS, STAGE_LABEL, hours, minutesToHours, shortDate } from '@/lib/format'

export function MyWork() {
  const { profile } = useAuth()
  const { running } = useTimer()
  const { data: tasks = [], isLoading } = useTasks()
  const { data: people = [] } = useProfiles()
  const { data: hoursByTask = {} } = useTaskHours()
  const { data: projects = [] } = useProjectBudgets()
  const { data: deliverables = [] } = useDeliverables()

  const weekStart = useMemo(() => {
    const d = new Date()
    const day = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }, [])

  const { data: myWeek = [] } = useTimeEntries({ userId: profile?.id, since: weekStart })

  const myTasks = useMemo(
    () => tasks.filter((t) => t.assignee_id === profile?.id),
    [tasks, profile],
  )
  const openTasks = myTasks.filter((t) => t.status !== 'done')
  const overdue = openTasks.filter((t) => t.due_date && new Date(t.due_date) < new Date())
  const weekHours = myWeek.reduce((sum, e) => sum + minutesToHours(e.duration_minutes), 0)
  const billableHours = myWeek
    .filter((e) => e.is_billable)
    .reduce((sum, e) => sum + minutesToHours(e.duration_minutes), 0)

  const myReviews = useMemo(
    () =>
      deliverables.filter(
        (d) =>
          (d.reviewer_id === profile?.id && d.stage === 'internal_review') ||
          (d.owner_id === profile?.id && d.stage === 'revisions_requested'),
      ),
    [deliverables, profile],
  )

  const projectName = (id: string) => projects.find((p) => p.project_id === id)?.name ?? ''
  const projectNames = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.project_id, p.name])),
    [projects],
  )

  if (isLoading) return <Spinner />

  return (
    <div>
      <PageHeader
        title={`Good to see you, ${profile?.full_name?.split(' ')[0]}`}
        subtitle={
          running
            ? 'A timer is running right now.'
            : 'Here is what is on your plate this week.'
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hours this week"
          value={hours(weekHours)}
          sub={`${hours(billableHours)} billable · ${profile?.capacity_hours_per_week}h capacity`}
          icon={<Clock size={16} />}
        />
        <StatCard label="Open tasks" value={openTasks.length} sub={`${myTasks.length} assigned in total`} />
        <StatCard
          label="Overdue"
          value={overdue.length}
          tone={overdue.length ? 'text-rose-600' : 'text-slate-900'}
          sub={overdue.length ? 'Needs attention today' : 'Nothing late'}
          icon={<AlertTriangle size={16} />}
        />
        <StatCard
          label="Waiting on you"
          value={myReviews.length}
          sub="Deliverables to review or revise"
          icon={<FileCheck2 size={16} />}
        />
      </div>

      {myReviews.length > 0 && (
        <div className="card mb-6 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">Deliverables waiting on you</p>
          <div className="space-y-2">
            {myReviews.map((d) => (
              <Link
                key={d.id}
                to="/deliverables"
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{d.title}</span>
                  <span className="block text-xs text-slate-500">
                    {projectName(d.project_id)} · due {shortDate(d.due_date)}
                  </span>
                </span>
                <span className={`chip ${STAGE_CLASS[d.stage]}`}>{STAGE_LABEL[d.stage]}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">My tasks</h2>
      {myTasks.length === 0 ? (
        <EmptyState title="Nothing assigned to you yet." hint="Tasks assigned to you will show up here." />
      ) : (
        <TaskViews
          tasks={myTasks}
          people={people}
          hoursByTask={hoursByTask}
          projectNames={projectNames}
        />
      )}

      {openTasks.length === 0 && myTasks.length > 0 && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> Everything assigned to you is done.
        </p>
      )}
    </div>
  )
}
