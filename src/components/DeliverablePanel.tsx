import { useState } from 'react'
import {
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  Link2,
  Paperclip,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import type { Deliverable, DeliverableAttachment, DeliverableStage, Profile } from '@/lib/types'
import { STAGE_CLASS, STAGE_LABEL, longDate, money, relativeTime, shortDate } from '@/lib/format'
import {
  useAcceptDeliverable,
  useAddDeliverableAttachment,
  useAddDeliverableComment,
  useDeleteDeliverable,
  useDeleteDeliverableAttachment,
  useDeleteDeliverableComment,
  useDeliverableAttachments,
  useDeliverableFeeAllocations,
  useDeliverableReviews,
  useDeliverableComments,
  useTasks,
  useTransitionDeliverable,
  useUnacceptDeliverable,
  useUpdateDeliverable,
} from '@/lib/queries'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { Avatar, ConfirmDialog, Spinner } from './ui'
import { DeliverableFormFields, type DeliverableFormValues } from './DeliverableForm'

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
  const { profile, isLeadership } = useAuth()
  const { data: reviews = [], isLoading } = useDeliverableReviews(deliverable.id)
  const { data: tasks = [] } = useTasks(deliverable.project_id)
  // Only a deliverable attached to a deliverable-tracked task carries money.
  // On a time-tracked task (or none at all) the stage board is the whole story
  // and none of the payment UI below should appear.
  const linkedTask = tasks.find((t) => t.id === deliverable.task_id)
  const isPaidByFee = linkedTask?.tracking_mode === 'deliverable'
  const { data: feeAllocations = [] } = useDeliverableFeeAllocations(
    isPaidByFee ? deliverable.id : undefined,
  )
  const accept = useAcceptDeliverable()
  const unaccept = useUnacceptDeliverable()
  const { data: comments = [], isLoading: commentsLoading } = useDeliverableComments(deliverable.id)
  const transition = useTransitionDeliverable()
  const update = useUpdateDeliverable()
  const deleteDeliverable = useDeleteDeliverable()
  const addComment = useAddDeliverableComment()
  const deleteComment = useDeleteDeliverableComment()

  const [pending, setPending] = useState<DeliverableStage | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const nameOf = (id: string | null) => people.find((p) => p.user_id === id)?.full_name ?? 'Unassigned'
  const isOwner = deliverable.owner_id === profile?.user_id
  const isReviewer = deliverable.reviewer_id === profile?.user_id
  const canEdit = isOwner || isReviewer || isLeadership

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

  // -------------------------------------------------------------- editing
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<DeliverableFormValues>({
    title: deliverable.title,
    description: deliverable.description ?? '',
    taskId: deliverable.task_id ?? '',
    ownerId: deliverable.owner_id ?? '',
    reviewerId: deliverable.reviewer_id ?? '',
    dueDate: deliverable.due_date ?? '',
  })

  function patch(p: Partial<DeliverableFormValues>) {
    setValues((v) => ({ ...v, ...p }))
  }

  async function saveEdit() {
    if (!values.title.trim()) return
    await update.mutateAsync({
      id: deliverable.id,
      patch: {
        title: values.title.trim(),
        description: values.description.trim() || null,
        task_id: values.taskId || null,
        owner_id: values.ownerId || null,
        reviewer_id: values.reviewerId || null,
        due_date: values.dueDate || null,
      },
    })
    setEditing(false)
  }

  // ------------------------------------------------------------ attachments
  const { data: attachments = [], isLoading: attachmentsLoading } = useDeliverableAttachments(deliverable.id)
  const addAttachment = useAddDeliverableAttachment()
  const deleteAttachment = useDeleteDeliverableAttachment()
  const [uploading, setUploading] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [linkInput, setLinkInput] = useState('')
  const [addingLink, setAddingLink] = useState(false)

  async function uploadFiles(files: FileList) {
    if (!profile) return
    setUploading(true)
    setAttachError(null)
    try {
      for (const file of Array.from(files)) {
        // Timestamp-prefixed so uploading the same filename twice adds a
        // second attachment instead of colliding/overwriting the first.
        const path = `${deliverable.org_id}/${deliverable.id}/${Date.now()}-${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('deliverable-files')
          .upload(path, file, { contentType: file.type })
        if (uploadError) throw uploadError
        await addAttachment.mutateAsync({
          org_id: deliverable.org_id,
          deliverable_id: deliverable.id,
          added_by: profile.user_id,
          kind: 'file',
          file_path: path,
          url: null,
          label: file.name,
          file_size: file.size,
          content_type: file.type || null,
        })
      }
    } catch (e) {
      setAttachError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function saveLink() {
    if (!linkInput.trim() || !profile) return
    await addAttachment.mutateAsync({
      org_id: deliverable.org_id,
      deliverable_id: deliverable.id,
      added_by: profile.user_id,
      kind: 'link',
      file_path: null,
      url: linkInput.trim(),
      label: linkInput.trim(),
      file_size: null,
      content_type: null,
    })
    setLinkInput('')
    setAddingLink(false)
  }

  async function openAttachment(a: DeliverableAttachment) {
    setAttachError(null)
    if (a.kind === 'link') {
      window.open(a.url!, '_blank', 'noopener')
      return
    }
    const { data, error: signError } = await supabase.storage
      .from('deliverable-files')
      .createSignedUrl(a.file_path!, 600)
    if (signError || !data?.signedUrl) {
      setAttachError(signError?.message ?? "Couldn't open file")
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function removeAttachment(a: DeliverableAttachment) {
    if (a.kind === 'file' && a.file_path) {
      await supabase.storage.from('deliverable-files').remove([a.file_path])
    }
    deleteAttachment.mutate({ id: a.id, deliverableId: deliverable.id })
  }

  // -------------------------------------------------------------- comments
  const [commentDraft, setCommentDraft] = useState('')

  async function postComment() {
    if (!profile || !commentDraft.trim()) return
    await addComment.mutateAsync({
      org_id: deliverable.org_id,
      deliverable_id: deliverable.id,
      author_id: profile.user_id,
      body: commentDraft.trim(),
    })
    setCommentDraft('')
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function del() {
    setConfirmingDelete(false)
    deleteDeliverable.mutate(deliverable.id, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-brand-800/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-cream-300 bg-white px-5 py-3.5">
          <p className="text-sm font-semibold">Deliverable</p>
          <button className="btn-ghost !px-2.5" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {editing ? (
            <div className="rounded-xl border border-cream-300 p-4">
              <DeliverableFormFields values={values} onChange={patch} people={people} tasks={tasks} />
              <div className="mt-3 flex gap-2">
                <button
                  className="btn-primary"
                  disabled={!values.title.trim() || update.isPending}
                  onClick={() => void saveEdit()}
                >
                  Save
                </button>
                <button className="btn-ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-ink-900">{deliverable.title}</h2>
                    {canEdit && (
                      <button
                        className="text-ink-400 hover:text-brand-700"
                        title="Edit"
                        onClick={() => setEditing(true)}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {projectName} · v{deliverable.version} · due {shortDate(deliverable.due_date)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`chip ${STAGE_CLASS[deliverable.stage]}`}>
                    {STAGE_LABEL[deliverable.stage]}
                  </span>
                  {isPaidByFee && deliverable.accepted_at && (
                    <span className="chip bg-emerald-100 text-emerald-800">
                      <Check size={11} /> Fee released
                    </span>
                  )}
                </div>
              </div>

              {deliverable.description && (
                <p className="mt-3 text-sm text-ink-600">{deliverable.description}</p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-cream-300 p-3">
                  <p className="label !mb-1">Owner</p>
                  <span className="flex items-center gap-2 text-sm">
                    <Avatar name={nameOf(deliverable.owner_id)} size={22} />
                    {nameOf(deliverable.owner_id)}
                  </span>
                </div>
                <div className="rounded-xl border border-cream-300 p-3">
                  <p className="label !mb-1">Reviewer</p>
                  <span className="flex items-center gap-2 text-sm">
                    <Avatar name={nameOf(deliverable.reviewer_id)} size={22} />
                    {nameOf(deliverable.reviewer_id)}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Attachments --------------------------------------------------- */}
          <div className="mt-4 rounded-xl border border-cream-300 p-4">
            <p className="mb-2 text-sm font-semibold text-ink-900">
              Attachments{attachments.length > 0 && ` (${attachments.length})`}
            </p>

            {attachmentsLoading ? (
              <Spinner label="Loading attachments" />
            ) : attachments.length === 0 ? (
              <p className="text-sm text-ink-500">Nothing attached yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {attachments.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-cream-200 px-3 py-2"
                  >
                    <button
                      className="flex min-w-0 items-center gap-2 text-sm text-brand-700 hover:underline"
                      onClick={() => void openAttachment(a)}
                    >
                      {a.kind === 'link' ? (
                        <Link2 size={15} className="shrink-0" />
                      ) : (
                        <Paperclip size={15} className="shrink-0" />
                      )}
                      <span className="truncate">{a.label}</span>
                      {a.kind === 'link' ? (
                        <ExternalLink size={12} className="shrink-0" />
                      ) : (
                        <Download size={12} className="shrink-0" />
                      )}
                    </button>
                    {(canEdit || a.added_by === profile?.user_id) && (
                      <button
                        className="shrink-0 text-ink-400 hover:text-rose-600"
                        onClick={() => void removeAttachment(a)}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="btn-ghost cursor-pointer !py-1.5 !px-3 text-xs">
                  <Paperclip size={13} /> Add file
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const files = e.target.files
                      e.target.value = ''
                      if (files && files.length > 0) void uploadFiles(files)
                    }}
                  />
                </label>
                {addingLink ? (
                  <>
                    <input
                      className="input !w-auto flex-1 !py-1.5 text-xs"
                      placeholder="https://..."
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveLink()
                      }}
                      autoFocus
                    />
                    <button className="btn-primary !py-1.5 !px-3 text-xs" onClick={() => void saveLink()}>
                      Save
                    </button>
                    <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setAddingLink(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setAddingLink(true)}>
                    <Link2 size={13} /> Add a link
                  </button>
                )}
              </div>
            )}
            {uploading && <p className="mt-2 text-xs text-ink-500">Uploading…</p>}
            {attachError && <p className="mt-2 text-xs text-rose-600">{attachError}</p>}
          </div>

          {/* Payment ---------------------------------------------------
              Deliberately separate from the stage board above. The stages are
              the client-facing review flow; acceptance is the money event that
              makes this deliverable's fee earned and payable, and it is the
              workstream lead's call regardless of where the stage board sits. */}
          {isPaidByFee && (
            <div className="mt-4 rounded-xl border border-cream-300 p-4">
              <p className="mb-1 text-sm font-semibold text-ink-900">Payment</p>
              <p className="mb-3 text-xs text-ink-500">
                {deliverable.accepted_at
                  ? `Accepted ${relativeTime(deliverable.accepted_at)} — the fee is on its way through payroll.`
                  : 'Paid as a flat fee once a workstream lead accepts it. Hours logged against this task earn nothing.'}
              </p>

              {feeAllocations.length === 0 ? (
                <p className="text-sm text-ink-500">
                  No fee set yet — a lead sets it on the task, under Deliverables.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {feeAllocations.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-cream-200 px-2.5 py-1.5"
                    >
                      <span className="flex items-center gap-2 text-sm text-ink-800">
                        <Avatar name={nameOf(f.profile_id)} size={20} />
                        {nameOf(f.profile_id)}
                      </span>
                      <span className="tabular-nums text-sm font-semibold">{money(Number(f.amount))}</span>
                    </div>
                  ))}
                </div>
              )}

              {isLeadership && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {deliverable.accepted_at ? (
                    <button
                      className="btn-ghost"
                      disabled={unaccept.isPending}
                      onClick={() => unaccept.mutate({ id: deliverable.id })}
                    >
                      <RotateCcw size={15} /> Withdraw acceptance
                    </button>
                  ) : (
                    <button
                      className="btn-primary"
                      disabled={
                        feeAllocations.length === 0 ||
                        accept.isPending ||
                        feeAllocations.some((f) => f.profile_id === profile?.user_id)
                      }
                      title={
                        feeAllocations.length === 0
                          ? 'Set the fee on the task first'
                          : feeAllocations.some((f) => f.profile_id === profile?.user_id)
                            ? 'You are being paid for this one — another lead has to accept it'
                            : undefined
                      }
                      onClick={() => accept.mutate({ id: deliverable.id })}
                    >
                      <Check size={15} /> Accept &amp; release fee
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions --------------------------------------------------- */}
          <div className="mt-4 rounded-xl border border-cream-300 p-4">
            <p className="mb-3 text-sm font-semibold text-ink-900">Move this forward</p>

            {pending ? (
              // Confirming a request-changes/reopen decision: only the
              // comment box and Send/Cancel are on screen. Previously the
              // full button row (including "Approve & send to client")
              // stayed visible here too — clicking the wrong one while a
              // change-request comment was still sitting in the box would
              // silently approve the deliverable instead, carrying that
              // comment along with it. Hiding the other buttons during this
              // step makes that impossible.
              <>
                <textarea
                  className="input mb-3 min-h-[80px]"
                  placeholder="What needs to change? (required)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  autoFocus
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-danger"
                    disabled={!comment.trim() || transition.isPending}
                    onClick={() => void go(pending)}
                  >
                    {actionIcon(pending)} {ACTION_LABEL[pending]}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setPending(null)
                      setComment('')
                      setError(null)
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
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
            )}

            {isOwner && NEXT_STAGES[deliverable.stage].some((s) => s === 'client_review' || s === 'approved') && (
              <p className="mt-2 text-xs text-ink-500">
                You own this one, so someone else has to approve it.
              </p>
            )}
            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          </div>

          {/* Audit trail ----------------------------------------------- */}
          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold text-ink-900">History</p>
            {isLoading ? (
              <Spinner label="Loading history" />
            ) : reviews.length === 0 ? (
              <p className="text-sm text-ink-500">Nothing has happened to this yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-cream-300 pl-5">
                {reviews.map((r) => (
                  <li key={r.id} className="relative">
                    <span
                      className={`absolute -left-[26px] top-1 grid h-3 w-3 place-items-center rounded-full ring-4 ring-white ${
                        r.decision === 'approve'
                          ? 'bg-brand-500'
                          : r.decision === 'request_changes' || r.decision === 'reopen'
                            ? 'bg-rose-500'
                            : 'bg-brand-500'
                      }`}
                    />
                    <p className="text-sm text-ink-900">
                      <span className="font-medium">{r.actor_label}</span>{' '}
                      <span className="text-ink-500">
                        moved it {r.from_stage ? STAGE_LABEL[r.from_stage] : 'in'}
                      </span>{' '}
                      <ArrowRight size={12} className="inline text-ink-400" />{' '}
                      <span className="font-medium">{STAGE_LABEL[r.to_stage]}</span>
                    </p>
                    {r.comment && (
                      <p className="mt-1 rounded-lg bg-cream-100 px-3 py-2 text-sm text-ink-700">
                        “{r.comment}”
                      </p>
                    )}
                    <p className="mt-1 text-xs text-ink-400" title={longDate(r.created_at)}>
                      {relativeTime(r.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Comments ---------------------------------------------------- */}
          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold text-ink-900">Comments</p>
            {commentsLoading ? (
              <Spinner label="Loading comments" />
            ) : comments.length === 0 ? (
              <p className="text-sm text-ink-500">No comments yet.</p>
            ) : (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="flex items-start gap-2.5">
                    <Avatar name={nameOf(c.author_id)} size={24} />
                    <div className="min-w-0 flex-1 rounded-xl bg-cream-100 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-ink-900">{nameOf(c.author_id)}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-ink-400">{relativeTime(c.created_at)}</span>
                          {(c.author_id === profile?.user_id || isLeadership) && (
                            <button
                              className="text-ink-400 hover:text-rose-600"
                              onClick={() =>
                                deleteComment.mutate({ id: c.id, deliverableId: deliverable.id })
                              }
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-700">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex gap-2">
              <input
                className="input"
                placeholder="Add a comment…"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void postComment()
                }}
              />
              <button
                className="btn-primary !px-3"
                disabled={!commentDraft.trim() || addComment.isPending}
                onClick={() => void postComment()}
              >
                Post
              </button>
            </div>
          </div>

          {isLeadership && (
            <div className="mt-6 border-t border-cream-200 pt-4">
              <button
                className="text-xs text-ink-400 hover:text-rose-600"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 size={12} className="mr-1 inline" /> Delete deliverable
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${deliverable.title}"?`}
          message="This can't be undone."
          busy={deleteDeliverable.isPending}
          onConfirm={del}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
