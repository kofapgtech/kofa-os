import { Check, Paperclip } from 'lucide-react'
import type { Deliverable, Profile } from '@/lib/types'
import { STAGE_CLASS, STAGE_LABEL, isPastDue, shortDate } from '@/lib/format'
import { Avatar } from './ui'

/** One deliverable, as shown on the kanban board and a project's Deliverables
 *  tab — owner/reviewer avatars and an attachment indicator up front, so you
 *  don't have to open a card just to see who's involved or whether there's
 *  anything attached yet. */
export function DeliverableCard({
  deliverable: d,
  people,
  projectName,
  showStage = true,
  attachmentCount = 0,
  onClick,
}: {
  deliverable: Deliverable
  people: Profile[]
  /** Shown under the title — omit on a board already grouped/scoped by project. */
  projectName?: string
  /** Omit inside a column that's already grouped by stage (redundant there). */
  showStage?: boolean
  /** From useDeliverableAttachmentCounts() — a deliverable can now have any
   *  number of files/links, so this shows a count rather than one icon. */
  attachmentCount?: number
  onClick: () => void
}) {
  const nameOf = (id: string | null) => people.find((p) => p.user_id === id)?.full_name
  const overdue = d.stage !== 'approved' && isPastDue(d.due_date)

  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-cream-300 bg-white p-3 text-left shadow-sm transition-colors hover:border-brand-300"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-ink-900">{d.title}</p>
        {showStage && (
          <span className={`chip shrink-0 ${STAGE_CLASS[d.stage]}`}>{STAGE_LABEL[d.stage]}</span>
        )}
      </div>

      {projectName && <p className="mt-1 truncate text-xs text-ink-500">{projectName}</p>}

      <div className="mt-2.5 flex items-center gap-1">
        <Avatar name={nameOf(d.owner_id)} size={18} />
        <Avatar name={nameOf(d.reviewer_id)} size={18} />
        {/* Acceptance is the money event, separate from the stage board this
            card is grouped by — a deliverable can sit in client_review and
            already have had its fee released, or vice versa. */}
        {d.accepted_at && (
          <span
            className="ml-1 flex items-center gap-0.5 text-emerald-600"
            title="Fee released to whoever earned it"
          >
            <Check size={12} />
            <span className="text-[11px] font-medium">Paid out</span>
          </span>
        )}
        {attachmentCount > 0 && (
          <span
            className="ml-1 flex items-center gap-0.5 text-ink-400"
            title={`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`}
          >
            <Paperclip size={12} />
            <span className="text-[11px] tabular-nums">{attachmentCount}</span>
          </span>
        )}
      </div>

      <p className={`mt-2 text-xs ${overdue ? 'font-semibold text-rose-600' : 'text-ink-400'}`}>
        v{d.version} · due {shortDate(d.due_date)}
      </p>
    </button>
  )
}
