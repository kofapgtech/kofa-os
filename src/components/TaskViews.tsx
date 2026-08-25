import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Flame,
  Hourglass,
  LayoutGrid,
  List as ListIcon,
  ListPlus,
  Play,
  Plus,
  X,
} from 'lucide-react'
import type { Profile, Task, TaskStatus } from '@/lib/types'
import {
  PRIORITY_CLASS,
  PRIORITY_OPTION_CLASS,
  TASK_STATUS_CLASS,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  hours,
  relativeTime,
  shortDate,
} from '@/lib/format'
import {
  useCreateTask,
  useDecideTimeExtension,
  useDepartments,
  useRequestTimeExtension,
  useSetTaskAssignees,
  useTaskAssignees,
  useTaskTimeRequests,
  useUpdateTask,
} from '@/lib/queries'
import { useAuth } from '@/contexts/AuthContext'
import { useTimer } from '@/contexts/TimerContext'
import { Avatar, Chip, EmptyState, Spinner } from './ui'

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

  const { data: taskAssignees = [] } = useTaskAssignees()

  const nameById = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, p.full_name])),
    [people],
  )

  const assigneesByTask = useMemo(() => {
    const map: Record<string, string[]> = {}
    taskAssignees.forEach((a) => {
      ;(map[a.task_id] ||= []).push(a.profile_id)
    })
    return map
  }, [taskAssignees])

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (status === 'all' || t.status === status) &&
          (assignee === 'all' || (assigneesByTask[t.id] ?? []).includes(assignee)),
      ),
    [tasks, status, assignee, assigneesByTask],
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-cream-300 bg-white p-0.5">
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
                mode === key ? 'bg-brand-800 text-white' : 'text-ink-600 hover:bg-cream-200'
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

        <span className="text-sm text-ink-500">{filtered.length} tasks</span>

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
          assigneesByTask={assigneesByTask}
          hoursByTask={hoursByTask}
          projectNames={projectNames}
          onOpen={setSelected}
        />
      ) : mode === 'board' ? (
        <BoardView tasks={filtered} nameById={nameById} assigneesByTask={assigneesByTask} onOpen={setSelected} />
      ) : (
        <CalendarView tasks={filtered} onOpen={setSelected} />
      )}

      {selected && (
        <TaskPanel
          task={selected}
          people={people}
          allTasks={tasks}
          assigneeIds={assigneesByTask[selected.id] ?? []}
          hoursLogged={hoursByTask[selected.id] ?? 0}
          onClose={() => setSelected(null)}
          onOpenSubtask={setSelected}
        />
      )}
      {adding && projectId && <NewTaskPanel projectId={projectId} people={people} onClose={() => setAdding(false)} />}
    </div>
  )
}

// -------------------------------------------------------------- assignees

/** Overlapping avatar stack, capped at 3 with a "+N" overflow badge. */
function AvatarStack({
  ids,
  nameById,
  size = 24,
}: {
  ids: string[]
  nameById: Record<string, string>
  size?: number
}) {
  if (ids.length === 0) return <Avatar name={undefined} size={size} />
  const shown = ids.slice(0, 3)
  return (
    <span className="flex items-center">
      {shown.map((id, i) => (
        <span key={id} className={i > 0 ? '-ml-2' : ''}>
          <Avatar name={nameById[id]} size={size} />
        </span>
      ))}
      {ids.length > shown.length && (
        <span
          className="-ml-2 inline-flex items-center justify-center rounded-full bg-cream-300 font-semibold text-ink-600"
          style={{ width: size, height: size, fontSize: size * 0.34 }}
        >
          +{ids.length - shown.length}
        </span>
      )}
    </span>
  )
}

/** Table-cell rendering of a task's assignees: stacked avatars + names. */
function AssigneeCell({ ids, nameById }: { ids: string[]; nameById: Record<string, string> }) {
  const names = ids.map((id) => nameById[id]).filter(Boolean)
  return (
    <span className="flex items-center gap-2">
      <AvatarStack ids={ids} nameById={nameById} size={24} />
      <span className="truncate text-sm">{names.length ? names.join(', ') : 'Unassigned'}</span>
    </span>
  )
}

/** Narrows the assignee pool to the chosen department's people, so
 *  assigning routes within the team it was handed to. Anyone already
 *  selected stays visible/removable even if they're not (or no longer) a
 *  member, so switching departments never silently disappears a pick. */
function assigneePool(people: Profile[], departmentId: string, selected: string[]) {
  if (!departmentId) return people
  return people.filter((p) => p.department_id === departmentId || selected.includes(p.id))
}

/** Picks which department (if any) a task is routed to. Setting one notifies
 *  that department's lead(s) to assign it to someone on their team. */
function DepartmentSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: departments = [] } = useDepartments()
  return (
    <div>
      <label className="label flex items-center gap-1.5">
        <Building2 size={13} /> Department
      </label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No department — assign directly</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Combobox-style multi-select: selected people show as removable pills in
 *  the trigger, with a dropdown list below for adding/removing more. */
function AssigneePicker({
  people,
  selected,
  onToggle,
}: {
  people: Profile[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const selectedPeople = people.filter((p) => selected.includes(p.id))

  return (
    <div ref={rootRef} className="relative">
      <div
        onClick={() => setOpen((v) => !v)}
        className="input flex min-h-[2.5rem] cursor-pointer flex-wrap items-center gap-1.5"
      >
        {selectedPeople.length === 0 ? (
          <span className="text-ink-400">Unassigned</span>
        ) : (
          selectedPeople.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-brand-700 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-white"
            >
              {p.full_name}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(p.id)
                }}
                className="rounded-full p-0.5 hover:bg-brand-600"
              >
                <X size={11} />
              </button>
            </span>
          ))
        )}
        <ChevronDown
          size={15}
          className={`ml-auto shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-cream-300 bg-white py-1 shadow-lg">
          {people.length === 0 && <p className="px-3 py-1.5 text-sm text-ink-400">No one to assign</p>}
          {people.map((p) => {
            const active = selected.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggle(p.id)}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-cream-100 ${
                  active ? 'font-semibold text-brand-700' : 'text-ink-700'
                }`}
              >
                {p.full_name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------- views

function ListView({
  tasks,
  nameById,
  assigneesByTask,
  hoursByTask,
  projectNames,
  onOpen,
}: {
  tasks: Task[]
  nameById: Record<string, string>
  assigneesByTask: Record<string, string[]>
  hoursByTask: Record<string, number>
  projectNames?: Record<string, string>
  onOpen: (t: Task) => void
}) {
  const update = useUpdateTask()

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-cream-300 bg-cream-100">
            <tr>
              <th className="th">Task</th>
              <th className="th">Status</th>
              <th className="th">Assignee</th>
              <th className="th">Priority</th>
              <th className="th">Due</th>
              <th className="th text-right">Logged / Est.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200">
            {tasks.map((t) => {
              const overdue = t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date()
              const urgent = t.priority === 'urgent'
              return (
                <tr key={t.id} className={`hover:bg-cream-100 ${urgent ? 'bg-rose-50/40' : ''}`}>
                  <td className={`td ${urgent ? 'border-l-4 border-l-rose-500' : ''}`}>
                    <button className="text-left" onClick={() => onOpen(t)}>
                      <span className="flex items-center gap-1.5 font-medium text-ink-900 hover:text-brand-700">
                        {urgent && <Flame size={14} className="shrink-0 text-rose-600" />}
                        {t.title}
                      </span>
                      {projectNames?.[t.project_id] && (
                        <span className="block text-xs text-ink-500">
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
                    <AssigneeCell ids={assigneesByTask[t.id] ?? []} nameById={nameById} />
                  </td>
                  <td className="td">
                    <Chip className={PRIORITY_CLASS[t.priority]}>{t.priority}</Chip>
                  </td>
                  <td className={`td ${overdue ? 'font-semibold text-rose-600' : ''}`}>
                    {shortDate(t.due_date)}
                  </td>
                  <td className="td text-right tabular-nums">
                    {hours(hoursByTask[t.id] ?? 0)}
                    <span className="text-ink-400"> / {t.estimated_hours ?? '—'}h</span>
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
  assigneesByTask,
  onOpen,
}: {
  tasks: Task[]
  nameById: Record<string, string>
  assigneesByTask: Record<string, string[]>
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
            className="min-w-[220px] rounded-2xl bg-cream-200/70 p-2"
          >
            <div className="mb-2 flex items-center justify-between px-1.5">
              <span className="text-sm font-semibold text-ink-700">{TASK_STATUS_LABEL[status]}</span>
              <span className="text-xs text-ink-500">{column.length}</span>
            </div>
            <div className="space-y-2">
              {column.map((t) => {
                const urgent = t.priority === 'urgent'
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => setDragging(t.id)}
                    onClick={() => onOpen(t)}
                    className={`cursor-grab rounded-xl border bg-white p-3 shadow-sm active:cursor-grabbing ${
                      urgent ? 'border-rose-200 border-l-4 border-l-rose-500 bg-rose-50/40' : 'border-cream-300'
                    }`}
                  >
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                      {urgent && <Flame size={13} className="shrink-0 text-rose-600" />}
                      {t.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Chip className={PRIORITY_CLASS[t.priority]}>{t.priority}</Chip>
                      <span className="flex items-center gap-1.5 text-xs text-ink-500">
                        {shortDate(t.due_date)}
                        <AvatarStack ids={assigneesByTask[t.id] ?? []} nameById={nameById} size={20} />
                      </span>
                    </div>
                  </div>
                )
              })}
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

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink-500">
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
                isToday ? 'border-brand-400 bg-brand-50/50' : 'border-cream-300'
              }`}
            >
              <p className={`text-xs ${isToday ? 'font-bold text-brand-700' : 'text-ink-500'}`}>{day}</p>
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
                  <p className="px-1 text-[11px] text-ink-500">+{items.length - 3} more</p>
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
      <div className="absolute inset-0 bg-brand-800/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-cream-300 bg-white px-5 py-3.5">
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
  allTasks,
  assigneeIds,
  hoursLogged,
  onClose,
  onOpenSubtask,
}: {
  task: Task
  people: Profile[]
  allTasks: Task[]
  assigneeIds: string[]
  hoursLogged: number
  onClose: () => void
  onOpenSubtask: (t: Task) => void
}) {
  const update = useUpdateTask()
  const setAssignees = useSetTaskAssignees()
  const { profile } = useAuth()
  const { start, running } = useTimer()
  const [draft, setDraft] = useState(task)
  const [addingSubtask, setAddingSubtask] = useState(false)

  const subtasks = useMemo(
    () => allTasks.filter((t) => t.parent_task_id === task.id),
    [allTasks, task.id],
  )

  const pool = assigneePool(people, draft.department_id ?? '', assigneeIds)

  function patch(next: Partial<Task>) {
    setDraft((d) => ({ ...d, ...next }))
    update.mutate({ id: task.id, patch: next })
  }

  function toggleAssignee(id: string) {
    const next = assigneeIds.includes(id) ? assigneeIds.filter((a) => a !== id) : [...assigneeIds, id]
    setAssignees.mutate({ task_id: task.id, profile_ids: next, org_id: task.org_id, added_by: profile!.id })
  }

  return (
    <Drawer title="Task" onClose={onClose}>
      {draft.priority === 'urgent' && (
        <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700">
          <Flame size={13} /> Urgent — needs attention
        </div>
      )}
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
            className={`input font-medium ${PRIORITY_CLASS[draft.priority]}`}
            value={draft.priority}
            onChange={(e) => patch({ priority: e.target.value as Task['priority'] })}
          >
            {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
              <option key={p} value={p} className={PRIORITY_OPTION_CLASS[p]}>
                {p}
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

      <div className="mt-3">
        <DepartmentSelect
          value={draft.department_id ?? ''}
          onChange={(id) => patch({ department_id: id || null })}
        />
      </div>

      <div className="mt-3">
        <label className="label">Assignees</label>
        <AssigneePicker people={pool} selected={assigneeIds} onToggle={toggleAssignee} />
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

      <div className="mt-5 rounded-xl border border-cream-300 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-ink-600">
            <Clock size={15} /> Time logged
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {hours(hoursLogged)}
            <span className="font-normal text-ink-400"> of {task.estimated_hours ?? '—'}h est.</span>
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

      <div className="mt-4 rounded-xl border border-cream-300 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-900">Subtasks</span>
          <button className="btn-ghost !min-h-0 !py-1 !px-2 text-xs" onClick={() => setAddingSubtask(true)}>
            <ListPlus size={13} /> Add subtask
          </button>
        </div>
        {subtasks.length === 0 ? (
          <p className="text-sm text-ink-500">None yet.</p>
        ) : (
          <div className="space-y-1.5">
            {subtasks.map((st) => (
              <button
                key={st.id}
                onClick={() => onOpenSubtask(st)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-cream-200 px-2.5 py-1.5 text-left hover:bg-cream-100"
              >
                <span className="truncate text-sm text-ink-800">{st.title}</span>
                <span className={`chip shrink-0 ${TASK_STATUS_CLASS[st.status]}`}>
                  {TASK_STATUS_LABEL[st.status]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <TimeRequestSection task={task} />

      {addingSubtask && (
        <NewTaskPanel
          projectId={task.project_id}
          people={people}
          parentTaskId={task.id}
          onClose={() => setAddingSubtask(false)}
        />
      )}
    </Drawer>
  )
}

/** Requesting more hours on a task, and — for anyone RLS lets see a pending
 *  request that isn't their own — deciding it. Read access and decide
 *  authority share the same expression by design (see decide_time_extension
 *  and the time_requests_read policy), so "I can see it" already implies
 *  "I'm allowed to act on it" whenever it isn't mine. */
function TimeRequestSection({ task }: { task: Task }) {
  const { profile } = useAuth()
  const { data: requests = [], isLoading } = useTaskTimeRequests(task.id)
  const request = useRequestTimeExtension()
  const decide = useDecideTimeExtension()
  const [open, setOpen] = useState(false)
  const [reqHours, setReqHours] = useState('2')
  const [reason, setReason] = useState('')

  const pending = requests.filter((r) => r.status === 'pending')
  const decided = requests.filter((r) => r.status !== 'pending')

  return (
    <div className="mt-4 rounded-xl border border-cream-300 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <Hourglass size={14} /> Time requests
        </span>
        <button className="btn-ghost !min-h-0 !py-1 !px-2 text-xs" onClick={() => setOpen((v) => !v)}>
          Request more time
        </button>
      </div>

      {isLoading ? (
        <Spinner label="" />
      ) : requests.length === 0 && !open ? (
        <p className="text-sm text-ink-500">None yet.</p>
      ) : (
        <div className="space-y-2">
          {pending.map((r) => (
            <div key={r.id} className="rounded-lg border border-accent-200 bg-accent-50 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-ink-800">
                  <span className="font-semibold">{hours(r.requested_hours)}</span> requested
                  {r.reason ? ` — ${r.reason}` : ''}
                </p>
                <span className="shrink-0 text-xs text-ink-400">{relativeTime(r.created_at)}</span>
              </div>
              {r.requested_by !== profile?.id && (
                <div className="mt-2 flex gap-2">
                  <button
                    className="btn-primary !min-h-0 !py-1 !px-2.5 text-xs"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ requestId: r.id, decision: 'approve' })}
                  >
                    <Check size={12} /> Approve
                  </button>
                  <button
                    className="btn-danger !min-h-0 !py-1 !px-2.5 text-xs"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ requestId: r.id, decision: 'deny' })}
                  >
                    Deny
                  </button>
                </div>
              )}
            </div>
          ))}
          {decided.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 px-1 text-xs text-ink-500">
              <span>
                {hours(r.requested_hours)} — {r.status === 'approved' ? 'Approved' : 'Denied'}
              </span>
              <span>{r.decided_at ? relativeTime(r.decided_at) : ''}</span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-2 border-t border-cream-200 pt-3">
          <div>
            <label className="label">Hours</label>
            <input
              className="input"
              type="number"
              min="0.5"
              step="0.5"
              value={reqHours}
              onChange={(e) => setReqHours(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Reason</label>
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why do you need more time?"
            />
          </div>
          <button
            className="btn-primary w-full"
            disabled={!reqHours || Number(reqHours) <= 0 || request.isPending}
            onClick={async () => {
              await request.mutateAsync({
                org_id: profile!.org_id,
                task_id: task.id,
                requested_by: profile!.id,
                requested_hours: Number(reqHours),
                reason: reason.trim() || null,
              })
              setOpen(false)
              setReqHours('2')
              setReason('')
            }}
          >
            Submit request
          </button>
        </div>
      )}
    </div>
  )
}

function NewTaskPanel({
  projectId,
  people,
  parentTaskId,
  onClose,
}: {
  projectId: string
  people: Profile[]
  parentTaskId?: string
  onClose: () => void
}) {
  const { profile } = useAuth()
  const create = useCreateTask()
  const [title, setTitle] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [departmentId, setDepartmentId] = useState('')
  const [due, setDue] = useState('')
  const [estimate, setEstimate] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [note, setNote] = useState('')

  const pool = assigneePool(people, departmentId, assigneeIds)

  function toggleAssignee(id: string) {
    setAssigneeIds((ids) => (ids.includes(id) ? ids.filter((a) => a !== id) : [...ids, id]))
  }

  return (
    <Drawer title={parentTaskId ? 'New subtask' : 'New task'} onClose={onClose}>
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
        <div>
          <DepartmentSelect
            value={departmentId}
            onChange={(id) => {
              setDepartmentId(id)
              setAssigneeIds([])
            }}
          />
          {departmentId && (
            <p className="mt-1 text-xs text-ink-500">
              Leave assignees blank to let the department's lead pick who on their team does it.
            </p>
          )}
        </div>
        <div>
          <label className="label">Assignees</label>
          <AssigneePicker people={pool} selected={assigneeIds} onToggle={toggleAssignee} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Priority</label>
            <select
              className={`input font-medium ${PRIORITY_CLASS[priority]}`}
              value={priority}
              onChange={(e) => setPriority(e.target.value as Task['priority'])}
            >
              {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                <option key={p} value={p} className={PRIORITY_OPTION_CLASS[p]}>
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
        <div>
          <label className="label">Note</label>
          <textarea
            className="input min-h-[80px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Context, links, acceptance criteria…"
          />
        </div>

        <button
          className="btn-primary w-full"
          disabled={!title.trim() || create.isPending}
          onClick={async () => {
            await create.mutateAsync({
              org_id: profile!.org_id,
              project_id: projectId,
              title: title.trim(),
              description: note.trim() || null,
              assignee_ids: assigneeIds,
              department_id: departmentId || null,
              due_date: due || null,
              estimated_hours: estimate ? Number(estimate) : null,
              priority,
              created_by: profile!.id,
              parent_task_id: parentTaskId ?? null,
            })
            onClose()
          }}
        >
          <Plus size={16} /> Create task
        </button>
      </div>
    </Drawer>
  )
}
