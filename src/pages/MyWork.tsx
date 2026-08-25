import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, FileCheck2, Hourglass, Waypoints } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTimer } from '@/contexts/TimerContext'
import {
  useDeliverables,
  usePendingApprovals,
  useProfiles,
  useProjectBudgets,
  useTaskAssignees,
  useTaskHours,
  useTasks,
  useTimeEntries,
  useWorkstreamLeadMap,
} from '@/lib/queries'
import { TaskViews } from '@/components/TaskViews'
import { EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui'
import { STAGE_CLASS, STAGE_LABEL, hours, minutesToHours, shortDate } from '@/lib/format'

export function MyWork() {
  const { profile } = useAuth()
  const { running } = useTimer()
  const { data: tasks = [], isLoading } = useTasks()
  const { data: taskAssignees = [] } = useTaskAssignees()
  const { data: people = [] } = useProfiles()
  const { data: hoursByTask = {} } = useTaskHours()
  const { data: projects = [] } = useProjectBudgets()
  const { data: deliverables = [] } = useDeliverables()
  const { data: pendingRequests = [] } = usePendingApprovals()
  const { data: leadMap } = useWorkstreamLeadMap()

  const weekStart = useMemo(() => {
    const d = new Date()
    const day = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }, [])

  const { data: myWeek = [] } = useTimeEntries({ userId: profile?.id, since: weekStart })

  const myTaskIds = useMemo(
    () => new Set(taskAssignees.filter((a) => a.profile_id === profile?.id).map((a) => a.task_id)),
    [taskAssignees, profile],
  )
  const myTasks = useMemo(
    () => tasks.filter((t) => myTaskIds.has(t.id)),
    [tasks, myTaskIds],
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

  // RLS already scoped this to "my own, or ones I can decide" - excluding my
  // own here is the only client-side filter needed to get "waiting on me."
  const myApprovals = useMemo(
    () => pendingRequests.filter((r) => r.requested_by !== profile?.id),
    [pendingRequests, profile],
  )
  const taskById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks])

  // Tasks routed to the workstream I lead, still with nobody assigned —
  // mine to staff. A profile leads at most one workstream (DB-enforced).
  const myLeadWorkstreamId = profile ? leadMap?.get(profile.id)?.workstreamId : undefined
  const assignedTaskIds = useMemo(() => new Set(taskAssignees.map((a) => a.task_id)), [taskAssignees])
  const myWorkstreamQueue = useMemo(
    () =>
      myLeadWorkstreamId
        ? tasks.filter(
            (t) => t.workstream_id === myLeadWorkstreamId && t.status !== 'done' && !assignedTaskIds.has(t.id),
          )
        : [],
    [tasks, myLeadWorkstreamId, assignedTaskIds],
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
          tone={overdue.length ? 'text-rose-600' : 'text-ink-900'}
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
          <p className="mb-3 text-sm font-semibold text-ink-900">Deliverables waiting on you</p>
          <div className="space-y-2">
            {myReviews.map((d) => (
              <Link
                key={d.id}
                to="/deliverables"
                className="flex items-center justify-between gap-3 rounded-xl border border-cream-300 px-3 py-2.5 hover:bg-cream-100"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-900">{d.title}</span>
                  <span className="block text-xs text-ink-500">
                    {projectName(d.project_id)} · due {shortDate(d.due_date)}
                  </span>
                </span>
                <span className={`chip ${STAGE_CLASS[d.stage]}`}>{STAGE_LABEL[d.stage]}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {myApprovals.length > 0 && (
        <div className="card mb-6 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Hourglass size={15} /> Time requests waiting on you
          </p>
          <div className="space-y-2">
            {myApprovals.map((r) => {
              const t = taskById[r.task_id]
              return (
                <Link
                  key={r.id}
                  to={t ? `/projects/${t.project_id}` : '/projects'}
                  className="flex items-center justify-between gap-3 rounded-xl border border-cream-300 px-3 py-2.5 hover:bg-cream-100"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-900">
                      {t?.title ?? 'A task'}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {t ? projectName(t.project_id) : ''} · {r.reason ?? 'No reason given'}
                    </span>
                  </span>
                  <span className="chip shrink-0 bg-accent-100 text-accent-700">
                    {hours(r.requested_hours)}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {myWorkstreamQueue.length > 0 && (
        <div className="card mb-6 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Waypoints size={15} /> Tasks waiting for you to staff
          </p>
          <div className="space-y-2">
            {myWorkstreamQueue.map((t) => (
              <Link
                key={t.id}
                to={`/projects/${t.project_id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-cream-300 px-3 py-2.5 hover:bg-cream-100"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-900">{t.title}</span>
                  <span className="block text-xs text-ink-500">
                    {projectName(t.project_id)} · due {shortDate(t.due_date)}
                  </span>
                </span>
                <span className="chip shrink-0 bg-cream-200 text-ink-500">Unassigned</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">My tasks</h2>
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
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-brand-700">
          <CheckCircle2 size={16} /> Everything assigned to you is done.
        </p>
      )}
    </div>
  )
}
