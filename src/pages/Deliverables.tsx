import { useMemo, useState } from 'react'
import { Inbox } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDeliverables, useProfiles, useProjectBudgets } from '@/lib/queries'
import { DeliverablePanel } from '@/components/DeliverablePanel'
import { EmptyState, PageHeader, Spinner } from '@/components/ui'
import { STAGE_CLASS, STAGE_LABEL, STAGE_ORDER, shortDate } from '@/lib/format'
import type { Deliverable } from '@/lib/types'

export function Deliverables() {
  const { profile } = useAuth()
  const { data: deliverables = [], isLoading } = useDeliverables()
  const { data: people = [] } = useProfiles()
  const { data: projects = [] } = useProjectBudgets()
  const [open, setOpen] = useState<Deliverable | null>(null)
  const [onlyMine, setOnlyMine] = useState(false)

  const projectName = (id: string) => projects.find((p) => p.project_id === id)?.name ?? ''

  const waitingOnMe = useMemo(
    () =>
      deliverables.filter(
        (d) =>
          (d.reviewer_id === profile?.id && d.stage === 'internal_review') ||
          (d.owner_id === profile?.id && d.stage === 'revisions_requested'),
      ),
    [deliverables, profile],
  )

  const visible = onlyMine
    ? deliverables.filter((d) => d.owner_id === profile?.id || d.reviewer_id === profile?.id)
    : deliverables

  if (isLoading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Deliverables"
        subtitle="Every work product, and exactly who has the ball."
        actions={
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-cream-400"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
            />
            Only mine
          </label>
        }
      />

      {waitingOnMe.length > 0 && (
        <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 p-4">
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

      {visible.length === 0 ? (
        <EmptyState title="No deliverables yet." />
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
                    <button
                      key={d.id}
                      onClick={() => setOpen(d)}
                      className="w-full rounded-xl border border-cream-300 bg-white p-3 text-left shadow-sm hover:border-brand-300"
                    >
                      <p className="text-sm font-medium text-ink-900">{d.title}</p>
                      <p className="mt-1 text-xs text-ink-500">{projectName(d.project_id)}</p>
                      <p className="mt-2 text-xs text-ink-400">
                        v{d.version} · due {shortDate(d.due_date)}
                      </p>
                    </button>
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
    </div>
  )
}
