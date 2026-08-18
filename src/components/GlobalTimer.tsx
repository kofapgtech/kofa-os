import { useMemo, useState } from 'react'
import { Play, Square, Timer as TimerIcon } from 'lucide-react'
import { useTimer } from '@/contexts/TimerContext'
import { useProjectBudgets, useTasks } from '@/lib/queries'
import { useAuth } from '@/contexts/AuthContext'

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function GlobalTimer() {
  const { profile } = useAuth()
  const { running, elapsedSeconds, start, stop, busy } = useTimer()
  const { data: projects = [] } = useProjectBudgets()
  const { data: tasks = [] } = useTasks()
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [note, setNote] = useState('')

  const runningTask = useMemo(
    () => tasks.find((t) => t.id === running?.task_id),
    [tasks, running],
  )
  const runningProject = useMemo(
    () => projects.find((p) => p.project_id === running?.project_id),
    [projects, running],
  )

  // Default the picker to something the person is actually assigned to.
  const myTasks = useMemo(
    () => tasks.filter((t) => t.assignee_id === profile?.id && t.status !== 'done'),
    [tasks, profile],
  )
  const projectTasks = useMemo(
    () => tasks.filter((t) => t.project_id === projectId && t.status !== 'done'),
    [tasks, projectId],
  )

  if (running) {
    // Cream chip, so a running timer stands out against the green header.
    return (
      <div className="flex items-center gap-3 rounded-xl border border-cream-300 bg-cream-100 pl-3 pr-1.5 py-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold tabular-nums text-brand-900 leading-tight">
            {clock(elapsedSeconds)}
          </p>
          <p className="truncate text-xs text-brand-700 max-w-[180px] leading-tight">
            {runningTask?.title ?? runningProject?.name ?? 'Tracking'}
          </p>
        </div>
        <button
          className="btn bg-brand-600 text-cream-50 hover:bg-brand-700 !min-h-0 px-2.5 py-1.5"
          onClick={() => void stop()}
          disabled={busy}
          title="Stop timer"
        >
          <Square size={14} /> Stop
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <button className="btn-onbrand" onClick={() => setOpen((v) => !v)}>
        <TimerIcon size={16} /> Start timer
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 card p-4">
          <p className="text-sm font-semibold text-ink-900 mb-3">Track time</p>

          {myTasks.length > 0 && (
            <div className="mb-3">
              <p className="label">Your open tasks</p>
              <div className="max-h-40 overflow-y-auto -mx-1 px-1 space-y-1">
                {myTasks.slice(0, 8).map((t) => (
                  <button
                    key={t.id}
                    className="w-full text-left rounded-lg px-2 py-1.5 text-sm hover:bg-cream-200"
                    onClick={async () => {
                      await start(t.project_id, t.id)
                      setOpen(false)
                    }}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-cream-300 pt-3 space-y-2">
            <div>
              <label className="label">Project</label>
              <select
                className="input"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value)
                  setTaskId('')
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
                <label className="label">Task (optional)</label>
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
            <div>
              <label className="label">Note</label>
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What are you working on?"
              />
            </div>
            <button
              className="btn-primary w-full"
              disabled={!projectId || busy}
              onClick={async () => {
                await start(projectId, taskId || null, note || undefined)
                setOpen(false)
                setNote('')
              }}
            >
              <Play size={16} /> Start
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
