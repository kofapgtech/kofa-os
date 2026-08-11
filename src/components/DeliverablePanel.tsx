import { useState } from 'react'
import { ArrowRight, Check, RotateCcw, Send, X } from 'lucide-react'
import type { Deliverable, DeliverableStage, Profile } from '@/lib/types'
import { STAGE_CLASS, STAGE_LABEL, longDate, relativeTime, shortDate } from '@/lib/format'
import { useDeliverableReviews, useTransitionDeliverable } from '@/lib/queries'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar, Spinner } from './ui'

/** Mirrors the transitions the database will actually accept. */
const NEXT_STAGES: Record<DeliverableStage, DeliverableStage[]> = {
  draft: ['internal_review'],
  internal_review: ['client_review', 'revisions_requested'],
  client_review: ['approved', 'revisions_requested'],
  revisions_requested: ['internal_review'],
  approved: ['revisions_requested'],
}

const ACTION_LABEL: Record<DeliverableStage, string> = {
  internal_review: 'Submit for review',
  client_review: 'Approve & send to client',
  approved: 'Record client approval',
  revisions_requested: 'Request changes',
  draft: 'Back to draft',
}

function actionIcon(stage: DeliverableStage) {
  if (stage === 'revisions_requested') return <RotateCcw size={15} />
  if (stage === 'approved' || stage === 'client_review') return <Check size={15} />
  return <Send size={15} />
}

export function DeliverablePanel({
  deliverable,
  people,
  projectName,
  onClose,
}: {
  deliverable: Deliverable
  people: Profile[]
  projectName: string
  onClose: () => void
}) {
  const { profile } = useAuth()
  const { data: reviews = [], isLoading } = useDeliverableReviews(deliverable.id)
  const transition = useTransitionDeliverable()
  const [pending, setPending] = useState<DeliverableStage | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.full_name ?? 'Unassigned'
  const isOwner = deliverable.owner_id === profile?.id
  const needsComment = pending === 'revisions_requested'

  async function go(stage: DeliverableStage) {
    setError(null)
    if (NEXT_STAGES[deliverable.stage].includes(stage) && stage === 'revisions_requested' && !comment.trim()) {
      setPending(stage)
      return
    }
    try {
      await transition.mutateAsync({ id: deliverable.id, toStage: stage, comment: comment || undefined })
      setComment('')
      setPending(null)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5">
          <p className="text-sm font-semibold">Deliverable</p>
          <button className="btn-ghost !px-2.5" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{deliverable.title}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {projectName} · v{deliverable.version} · due {shortDate(deliverable.due_date)}
              </p>
            </div>
            <span className={`chip shrink-0 ${STAGE_CLASS[deliverable.stage]}`}>
              {STAGE_LABEL[deliverable.stage]}
            </span>
          </div>

          {deliverable.description && (
            <p className="mt-3 text-sm text-slate-600">{deliverable.description}</p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="label !mb-1">Owner</p>
              <span className="flex items-center gap-2 text-sm">
                <Avatar name={nameOf(deliverable.owner_id)} size={22} />
                {nameOf(deliverable.owner_id)}
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="label !mb-1">Reviewer</p>
              <span className="flex items-center gap-2 text-sm">
                <Avatar name={nameOf(deliverable.reviewer_id)} size={22} />
                {nameOf(deliverable.reviewer_id)}
              </span>
            </div>
          </div>

          {/* Actions --------------------------------------------------- */}
          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Move this forward</p>

            {(needsComment || pending) && (
              <textarea
                className="input mb-3 min-h-[80px]"
                placeholder="What needs to change? (required)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                autoFocus
              />
            )}

            <div className="flex flex-wrap gap-2">
              {NEXT_STAGES[deliverable.stage].map((stage) => {
                // Nobody signs off on their own work — the database enforces
                // this too, this just avoids offering a button that will fail.
                const selfApproval = isOwner && (stage === 'client_review' || stage === 'approved')
                return (
                  <button
                    key={stage}
                    disabled={selfApproval || transition.isPending}
                    title={selfApproval ? 'You cannot approve a deliverable you own' : undefined}
                    className={stage === 'revisions_requested' ? 'btn-danger' : 'btn-primary'}
                    onClick={() => void go(stage)}
                  >
                    {actionIcon(stage)} {ACTION_LABEL[stage]}
                  </button>
                )
              })}
            </div>

            {isOwner && NEXT_STAGES[deliverable.stage].some((s) => s === 'client_review' || s === 'approved') && (
              <p className="mt-2 text-xs text-slate-500">
                You own this one, so someone else has to approve it.
              </p>
            )}
            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          </div>

          {/* Audit trail ----------------------------------------------- */}
          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold text-slate-900">History</p>
            {isLoading ? (
              <Spinner label="Loading history" />
            ) : reviews.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing has happened to this yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {reviews.map((r) => (
                  <li key={r.id} className="relative">
                    <span
                      className={`absolute -left-[26px] top-1 grid h-3 w-3 place-items-center rounded-full ring-4 ring-white ${
                        r.decision === 'approve'
                          ? 'bg-emerald-500'
                          : r.decision === 'request_changes' || r.decision === 'reopen'
                            ? 'bg-rose-500'
                            : 'bg-brand-500'
                      }`}
                    />
                    <p className="text-sm text-slate-900">
                      <span className="font-medium">{r.actor_label}</span>{' '}
                      <span className="text-slate-500">
                        moved it {r.from_stage ? STAGE_LABEL[r.from_stage] : 'in'}
                      </span>{' '}
                      <ArrowRight size={12} className="inline text-slate-400" />{' '}
                      <span className="font-medium">{STAGE_LABEL[r.to_stage]}</span>
                    </p>
                    {r.comment && (
                      <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        “{r.comment}”
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-400" title={longDate(r.created_at)}>
                      {relativeTime(r.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
