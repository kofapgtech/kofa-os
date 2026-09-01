import { useMemo, useState } from 'react'
import { CalendarClock, Inbox, Plus, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDeliverableAttachmentCounts, useDeliverables, useProfiles, useProjectBudgets } from '@/lib/queries'
import { DeliverablePanel } from '@/components/DeliverablePanel'
import { DeliverableCard } from '@/components/DeliverableCard'
import { NewDeliverableModal } from '@/components/DeliverableForm'
import { EmptyState, PageHeader, Spinner } from '@/components/ui'
import { STAGE_CLASS, STAGE_LABEL, STAGE_ORDER, shortDate } from '@/lib/format'
import type { Deliverable } from '@/lib/types'

const DUE_SOON_DAYS = 7

export function Deliverables() {
  const { profile } = useAuth()
  const { data: deliverables = [], isLoading } = useDeliverables()
  const { data: attachmentCounts = {} } = useDeliverableAttachmentCounts()
  const { data: people = [] } = useProfiles()
  const { data: projects = [] } = useProjectBudgets()
  const [open, setOpen] = useState<Deliverable | null>(null)
  const [onlyMine, setOnlyMine] = useState(false)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState('')

  const projectName = (id: string) => projects.find((p) => p.project_id === id)?.name ?? ''

  const waitingOnMe = useMemo(
    () =>
      deliverables.filter(
        (d) =>
          (d.reviewer_id === profile?.user_id && d.stage === 'internal_review') ||
          (d.owner_id === profile?.user_id && d.stage === 'revisions_requested'),
      ),
    [deliverables, profile],
  )

  const dueSoon = useMemo(() => {
    const now = new Date()
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + DUE_SOON_DAYS)
    return deliverables.filter((d) => {
      if (!d.due_date || d.stage === 'approved') return false
      const due = new Date(d.due_date)
      return due >= now && due <= horizon
    })
  }, [deliverables])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return deliverables.filter((d) => {
      if (onlyMine && d.owner_id !== profile?.user_id && d.reviewer_id !== profile?.user_id) return false
      if (projectFilter && d.project_id !== projectFilter) return false
      if (q && !d.title.toLowerCase().includes(q) && !projectName(d.project_id).toLowerCase().includes(q))
        return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliverables, onlyMine, projectFilter, query, profile])

  if (isLoading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Deliverables"
        subtitle="Every work product, and exactly who has the ball."
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-cream-400"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
              />
              Only mine
            </label>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New deliverable
            </button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input !pl-9"
            placeholder="Search title or project…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input !w-auto"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.project_id} value={p.project_id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {waitingOnMe.length > 0 && (
        <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-900">
            <Inbox size={16} /> Waiting on you ({waitingOnMe.length})
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {waitingOnMe.map((d) => (
              <button
                key={d.id}
                onClick={() => setOpen(d)}
                className="flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-white px-3 py-2.5 text-left hover:border-brand-400"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-900">{d.title}</span>
                  <span className="block text-xs text-ink-500">{projectName(d.project_id)}</span>
                </span>
                <span className={`chip shrink-0 ${STAGE_CLASS[d.stage]}`}>{STAGE_LABEL[d.stage]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {dueSoon.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <CalendarClock size={16} /> Due in the next {DUE_SOON_DAYS} days ({dueSoon.length})
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {dueSoon.map((d) => (
              <button
                key={d.id}
                onClick={() => setOpen(d)}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-left hover:border-amber-400"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-900">{d.title}</span>
                  <span className="block text-xs text-ink-500">{projectName(d.project_id)}</span>
                </span>
                <span className="shrink-0 text-xs font-medium text-amber-700">
                  due {shortDate(d.due_date)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={deliverables.length === 0 ? 'No deliverables yet.' : 'Nothing matches these filters.'}
        />
      ) : (
        <div className="grid gap-3 overflow-x-auto sm:grid-cols-2 xl:grid-cols-5">
          {STAGE_ORDER.map((stage) => {
            const column = visible.filter((d) => d.stage === stage)
            return (
              <div key={stage} className="min-w-[220px] rounded-2xl bg-cream-200/70 p-2">
                <div className="mb-2 flex items-center justify-between px-1.5">
                  <span className="text-sm font-semibold text-ink-700">{STAGE_LABEL[stage]}</span>
                  <span className="text-xs text-ink-500">{column.length}</span>
                </div>
                <div className="space-y-2">
                  {column.map((d) => (
                    <DeliverableCard
                      key={d.id}
                      deliverable={d}
                      people={people}
                      projectName={projectName(d.project_id)}
                      showStage={false}
                      attachmentCount={attachmentCounts[d.id] ?? 0}
                      onClick={() => setOpen(d)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <DeliverablePanel
          deliverable={open}
          people={people}
          projectName={projectName(open.project_id)}
          onClose={() => setOpen(null)}
        />
      )}

      {creating && (
        <NewDeliverableModal projects={projects} people={people} onClose={() => setCreating(false)} />
      )}
    </div>
  )
}
