import { useMemo, useState } from 'react'
import { CalendarDays, Clock, LayoutGrid, List as ListIcon, Play, Plus, X } from 'lucide-react'
import type { Profile, Task, TaskStatus } from '@/lib/types'
import {
  PRIORITY_CLASS,
  TASK_STATUS_CLASS,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  hours,
  shortDate,
} from '@/lib/format'
import { useCreateTask, useUpdateTask } from '@/lib/queries'
import { useAuth } from '@/contexts/AuthContext'
import { useTimer } from '@/contexts/TimerContext'
import { Avatar, Chip, EmptyState } from './ui'

export type TaskViewMode = 'list' | 'board' | 'calendar'

interface Props {
  tasks: Task[]
  people: Profile[]
  hoursByTask: Record<string, number>
  projectId?: string
  /** Only supplied on cross-project views, where the project needs naming. */
  projectNames?: Record<string, string>
}

export function TaskViews({ tasks, people, hoursByTask, projectId, projectNames }: Props) {
  const [mode, setMode] = useState<TaskViewMode>('list')
  const [status, setStatus] = useState<TaskStatus | 'all'>('all')
  const [assignee, setAssignee] = useState('all')
  const [selected, setSelected] = useState<Task | null>(null)
  const [adding, setAdding] = useState(false)

  const nameById = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, p.full_name])),
    [people],
  )

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (status === 'all' || t.status === status) &&
          (assignee === 'all' || t.assignee_id === assignee),
      ),
    [tasks, status, assignee],
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
          {(
            [
              ['list', ListIcon, 'List'],
              ['board', LayoutGrid, 'Board'],
              ['calendar', CalendarDays, 'Calendar'],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <select
          className="input !w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value as TaskStatus | 'all')}
        >
          <option value="all">All statuses</option>
          {TASK_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        <select className="input !w-auto" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="all">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>

        <span className="text-sm text-slate-500">{filtered.length} tasks</span>

        {projectId && (
          <button className="btn-primary ml-auto" onClick={() => setAdding(true)}>
            <Plus size={16} /> New task
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No tasks match these filters." />
      ) : mode === 'list' ? (
        <ListView
          tasks={filtered}
          nameById={nameById}
          hoursByTask={hoursByTask}
          projectNames={projectNames}
          onOpen={setSelected}
        />
      ) : mode === 'board' ? (
        <BoardView tasks={filtered} nameById={nameById} onOpen={setSelected} />
      ) : (
        <CalendarView tasks={filtered} onOpen={setSelected} />
      )}

      {selected && (
        <TaskPanel
          task={selected}
          people={people}
          hoursLogged={hoursByTask[selected.id] ?? 0}
          onClose={() => setSelected(null)}
        />
      )}
      {adding && projectId && <NewTaskPanel projectId={projectId} people={people} onClose={() => setAdding(false)} />}
    </div>
  )
}

// ------------------------------------------------------------------- views

function ListView({
  tasks,
  nameById,
  hoursByTask,
  projectNames,
  onOpen,
}: {
  tasks: Task[]
  nameById: Record<string, string>
  hoursByTask: Record<string, number>
  projectNames?: Record<string, string>
  onOpen: (t: Task) => void
}) {
  const update = useUpdateTask()

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Task</th>
              <th className="th">Status</th>
              <th className="th">Assignee</th>
              <th className="th">Priority</th>
              <th className="th">Due</th>
              <th className="th text-right">Logged / Est.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const overdue = t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date()
              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="td">
                    <button className="text-left" onClick={() => onOpen(t)}>
                      <span className="block font-medium text-slate-900 hover:text-brand-700">
                        {t.title}
                      </span>
                      {projectNames?.[t.project_id] && (
                        <span className="block text-xs text-slate-500">
                          {projectNames[t.project_id]}
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="td">
                    <select
                      className={`chip cursor-pointer border-0 ${TASK_STATUS_CLASS[t.status]}`}
                      value={t.status}
                      onChange={(e) =>
                        update.mutate({ id: t.id, patch: { status: e.target.value as TaskStatus } })
                      }
                    >
                      {TASK_STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {TASK_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="td">
                    <span className="flex items-center gap-2">
                      <Avatar name={nameById[t.assignee_id ?? '']} size={24} />
                      <span className="text-sm">{nameById[t.assignee_id ?? ''] ?? 'Unassigned'}</span>
                    </span>
                  </td>
                  <td className="td">
                    <Chip className={PRIORITY_CLASS[t.priority]}>{t.priority}</Chip>
                  </td>
                  <td className={`td ${overdue ? 'font-semibold text-rose-600' : ''}`}>
                    {shortDate(t.due_date)}
                  </td>
                  <td className="td text-right tabular-nums">
                    {hours(hoursByTask[t.id] ?? 0)}
                    <span className="text-slate-400"> / {t.estimated_hours ?? '—'}h</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BoardView({
  tasks,
  nameById,
  onOpen,
}: {
  tasks: Task[]
  nameById: Record<string, string>
  onOpen: (t: Task) => void
}) {
  const update = useUpdateTask()
  const [dragging, setDragging] = useState<string | null>(null)

  return (
    <div className="grid gap-3 overflow-x-auto sm:grid-cols-2 xl:grid-cols-5">
      {TASK_STATUS_ORDER.map((status) => {
        const column = tasks.filter((t) => t.status === status)
        return (
          <div
            key={status}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging) update.mutate({ id: dragging, patch: { status } })
              setDragging(null)
            }}
            className="min-w-[220px] rounded-2xl bg-slate-100/70 p-2"
          >
            <div className="mb-2 flex items-center justify-between px-1.5">
              <span className="text-sm font-semibold text-slate-700">{TASK_STATUS_LABEL[status]}</span>
              <span className="text-xs text-slate-500">{column.length}</span>
            </div>
            <div className="space-y-2">
              {column.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragging(t.id)}
                  onClick={() => onOpen(t)}
                  className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
                >
                  <p className="text-sm font-medium text-slate-900">{t.title}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Chip className={PRIORITY_CLASS[t.priority]}>{t.priority}</Chip>
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      {shortDate(t.due_date)}
                      <Avatar name={nameById[t.assignee_id ?? '']} size={20} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CalendarView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const base = new Date()
  const month = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1)
  const firstWeekday = (month.getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()

  const byDay = useMemo(() => {
    const map: Record<number, Task[]> = {}
    tasks.forEach((t) => {
      if (!t.due_date) return
      const d = new Date(t.due_date)
      if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) return
      ;(map[d.getDate()] ||= []).push(t)
    })
    return map
  }, [tasks, month])

  const today = new Date()
  const isThisMonth =
    today.getMonth() === month.getMonth() && today.getFullYear() === month.getFullYear()

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <button className="btn-ghost" onClick={() => setMonthOffset((m) => m - 1)}>
          ←
        </button>
        <p className="text-sm font-semibold">
          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>
        <button className="btn-ghost" onClick={() => setMonthOffset((m) => m + 1)}>
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const items = byDay[day] ?? []
          const isToday = isThisMonth && today.getDate() === day
          return (
            <div
              key={day}
              className={`min-h-[92px] rounded-lg border p-1.5 ${
                isToday ? 'border-brand-400 bg-brand-50/50' : 'border-slate-200'
              }`}
            >
              <p className={`text-xs ${isToday ? 'font-bold text-brand-700' : 'text-slate-500'}`}>{day}</p>
              <div className="mt-1 space-y-1">
                {items.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOpen(t)}
                    className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${TASK_STATUS_CLASS[t.status]}`}
                    title={t.title}
                  >
                    {t.title}
                  </button>
                ))}
                {items.length > 3 && (
                  <p className="px-1 text-[11px] text-slate-500">+{items.length - 3} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ panels

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5">
          <p className="text-sm font-semibold">{title}</p>
          <button className="btn-ghost !px-2.5" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function TaskPanel({
  task,
  people,
  hoursLogged,
  onClose,
}: {
  task: Task
  people: Profile[]
  hoursLogged: number
  onClose: () => void
}) {
  const update = useUpdateTask()
  const { start, running } = useTimer()
  const [draft, setDraft] = useState(task)

  function patch(next: Partial<Task>) {
    setDraft((d) => ({ ...d, ...next }))
    update.mutate({ id: task.id, patch: next })
  }

  return (
    <Drawer title="Task" onClose={onClose}>
      <input
        className="input mb-4 !text-base !font-semibold"
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        onBlur={() => draft.title !== task.title && patch({ title: draft.title })}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Status</label>
          <select
            className="input"
            value={draft.status}
            onChange={(e) => patch({ status: e.target.value as TaskStatus })}
          >
            {TASK_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select
            className="input"
            value={draft.priority}
            onChange={(e) => patch({ priority: e.target.value as Task['priority'] })}
          >
            {['low', 'medium', 'high', 'urgent'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Assignee</label>
          <select
            className="input"
            value={draft.assignee_id ?? ''}
            onChange={(e) => patch({ assignee_id: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Due date</label>
          <input
            className="input"
            type="date"
            value={draft.due_date ?? ''}
            onChange={(e) => patch({ due_date: e.target.value || null })}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Description</label>
        <textarea
          className="input min-h-[100px]"
          value={draft.description ?? ''}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          onBlur={() => patch({ description: draft.description })}
          placeholder="Context, links, acceptance criteria…"
        />
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-slate-600">
            <Clock size={15} /> Time logged
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {hours(hoursLogged)}
            <span className="font-normal text-slate-400"> of {task.estimated_hours ?? '—'}h est.</span>
          </span>
        </div>
        <button
          className="btn-primary mt-3 w-full"
          disabled={!!running}
          onClick={() => void start(task.project_id, task.id, task.title)}
        >
          <Play size={15} /> {running ? 'A timer is already running' : 'Start timer on this task'}
        </button>
      </div>
    </Drawer>
  )
}

function NewTaskPanel({
  projectId,
  people,
  onClose,
}: {
  projectId: string
  people: Profile[]
  onClose: () => void
}) {
  const { profile } = useAuth()
  const create = useCreateTask()
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [estimate, setEstimate] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('medium')

  return (
    <Drawer title="New task" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Assignee</label>
            <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select
              className="input"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Task['priority'])}
            >
              {['low', 'medium', 'high', 'urgent'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Due date</label>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label className="label">Estimate (h)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.5"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
            />
          </div>
        </div>

        <button
          className="btn-primary w-full"
          disabled={!title.trim() || create.isPending}
          onClick={async () => {
            await create.mutateAsync({
              org_id: profile!.org_id,
              project_id: projectId,
              title: title.trim(),
              assignee_id: assignee || null,
              due_date: due || null,
              estimated_hours: estimate ? Number(estimate) : null,
              priority,
              created_by: profile!.id,
            })
            onClose()
          }}
        >
          <Plus size={16} /> Create task
        </button>
        {create.isError && (
          <p className="text-sm text-rose-600">{(create.error as Error).message}</p>
        )}
      </div>
    </Drawer>
  )
}
