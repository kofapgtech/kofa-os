import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, Lock, MessageSquare, Paperclip, RotateCcw, Send, Trash2, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import {
  useAddTicketAttachment,
  useAddTicketComment,
  useDeleteTicketAttachment,
  useDeleteTicketComment,
  useProfiles,
  useTicketAttachments,
  useTicketComments,
  useUpdateTicket,
} from '@/lib/queries'
import {
  TICKET_CATEGORY_LABEL,
  TICKET_CATEGORY_ORDER,
  TICKET_PRIORITY_CLASS,
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITY_ORDER,
  TICKET_STATUS_CLASS,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_ORDER,
  fileSize,
  longDate,
  relativeTime,
} from '@/lib/format'
import type { Ticket, TicketAttachment, TicketComment } from '@/lib/types'
import { Avatar, Chip, ConfirmDialog, Modal, Spinner } from './ui'

/** Private bucket. Path is `<org_id>/<ticket_id>/<timestamp>-<name>`, and the
 *  storage policies key off that first segment plus the object owner. */
export const TICKET_BUCKET = 'ticket-files'

/**
 * The one place a ticket is read and worked. Both audiences open the same
 * component; the differences are driven by `isAdmin` alone — a submitter sees
 * a read-only header plus the public thread, an admin additionally gets the
 * status/priority/owner controls and the internal-note composer.
 *
 * None of that gating is the security boundary. Internal notes are dropped by
 * the `ticket_comments_read` policy and an illegal status move is refused by
 * `tickets_guard_submitter_update()`; hiding the controls here just avoids
 * offering someone a button that could only fail.
 */
export function TicketPanel({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const { profile, isAdmin } = useAuth()
  const { data: people = [] } = useProfiles()
  const { data: comments = [], isLoading: loadingComments } = useTicketComments(ticket.id)
  const { data: attachments = [] } = useTicketAttachments(ticket.id)

  const update = useUpdateTicket()
  const addComment = useAddTicketComment()
  const deleteComment = useDeleteTicketComment()
  const addAttachment = useAddTicketAttachment()
  const deleteAttachment = useDeleteTicketAttachment()

  const [draft, setDraft] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TicketComment | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const personOf = useMemo(() => {
    const map = new Map(people.map((p) => [p.user_id, p]))
    return (id: string | null) => (id ? map.get(id) ?? null : null)
  }, [people])

  const submitter = personOf(ticket.submitted_by)
  const assignee = personOf(ticket.assigned_to)
  const isMine = profile?.user_id === ticket.submitted_by
  // A closed ticket is an archive: no replies, no attachments. Only an admin
  // can bring it back.
  const locked = ticket.status === 'closed'
  const admins = useMemo(() => people.filter((p) => p.role === 'admin'), [people])

  async function post() {
    const body = draft.trim()
    if (!body || !profile) return
    await addComment.mutateAsync({
      org_id: ticket.org_id,
      ticket_id: ticket.id,
      author_id: profile.user_id,
      body,
      is_internal: isAdmin && internal,
    })
    setDraft('')
    // The toggle deliberately survives the send: an admin writing one note is
    // usually writing two.
  }

  async function uploadFiles(files: FileList) {
    if (!profile) return
    setFileError(null)
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        // Timestamp-prefixed so the same filename can be attached twice
        // instead of silently overwriting the first copy.
        const path = `${ticket.org_id}/${ticket.id}/${Date.now()}-${file.name}`
        const { error } = await supabase.storage
          .from(TICKET_BUCKET)
          .upload(path, file, { contentType: file.type })
        if (error) throw error
        await addAttachment.mutateAsync({
          org_id: ticket.org_id,
          ticket_id: ticket.id,
          added_by: profile.user_id,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type || null,
        })
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Couldn't upload file")
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function openAttachment(a: TicketAttachment) {
    setFileError(null)
    const { data, error } = await supabase.storage
      .from(TICKET_BUCKET)
      .createSignedUrl(a.file_path, 600)
    if (error || !data?.signedUrl) {
      setFileError(error?.message ?? "Couldn't open file")
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function removeAttachment(a: TicketAttachment) {
    await supabase.storage.from(TICKET_BUCKET).remove([a.file_path])
    deleteAttachment.mutate({ id: a.id, ticketId: ticket.id })
  }

  function patch(p: Parameters<typeof update.mutate>[0]['patch']) {
    update.mutate({ id: ticket.id, patch: p })
  }

  return (
    <Modal onClose={onClose} className="max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            Ticket #{ticket.ticket_number}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-ink-900">{ticket.subject}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {submitter?.full_name ?? 'Someone'} · {longDate(ticket.created_at)}
          </p>
        </div>
        <button className="btn-ghost !px-2.5" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip className={TICKET_STATUS_CLASS[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</Chip>
        <Chip className={TICKET_PRIORITY_CLASS[ticket.priority]}>
          {TICKET_PRIORITY_LABEL[ticket.priority]}
        </Chip>
        <Chip className="bg-cream-200 text-ink-600">{TICKET_CATEGORY_LABEL[ticket.category]}</Chip>
        {assignee && (
          <span className="flex items-center gap-1.5 text-xs text-ink-500">
            <Avatar name={assignee.full_name} avatarUrl={assignee.avatar_url} size={20} />
            {assignee.full_name}
          </span>
        )}
      </div>

      <div className="mt-4 max-h-[58vh] space-y-5 overflow-y-auto pr-1">
        {isAdmin && (
          <div className="grid gap-3 rounded-xl border border-cream-300 bg-cream-50 p-3 sm:grid-cols-4">
            <label className="text-xs font-medium text-ink-500">
              Status
              <select
                className="input mt-1"
                value={ticket.status}
                disabled={update.isPending}
                onChange={(e) => patch({ status: e.target.value as Ticket['status'] })}
              >
                {TICKET_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {TICKET_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-ink-500">
              Priority
              <select
                className="input mt-1"
                value={ticket.priority}
                disabled={update.isPending}
                onChange={(e) => patch({ priority: e.target.value as Ticket['priority'] })}
              >
                {TICKET_PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {TICKET_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-ink-500">
              Category
              <select
                className="input mt-1"
                value={ticket.category}
                disabled={update.isPending}
                onChange={(e) => patch({ category: e.target.value as Ticket['category'] })}
              >
                {TICKET_CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {TICKET_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-ink-500">
              Owner
              <select
                className="input mt-1"
                value={ticket.assigned_to ?? ''}
                disabled={update.isPending}
                onChange={(e) => patch({ assigned_to: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {admins.map((a) => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {!isAdmin && isMine && ticket.status === 'resolved' && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
            <p className="text-sm text-ink-700">An admin marked this resolved. Is it sorted?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="btn-primary"
                disabled={update.isPending}
                onClick={() => patch({ status: 'closed' })}
              >
                <CheckCircle2 size={15} /> Yes, close it
              </button>
              <button
                className="btn-ghost"
                disabled={update.isPending}
                onClick={() => patch({ status: 'open' })}
              >
                <RotateCcw size={15} /> No, reopen
              </button>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">What was reported</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-700">{ticket.description}</p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Attachments ({attachments.length})
            </p>
            {!locked && (
              <div>
                <button
                  className="btn-ghost !py-1 !text-xs"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <Paperclip size={14} /> Add file
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && uploadFiles(e.target.files)}
                />
              </div>
            )}
          </div>
          {attachments.length === 0 ? (
            <p className="mt-1.5 text-sm text-ink-400">None.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border border-cream-300 px-2.5 py-1.5"
                >
                  <Paperclip size={14} className="shrink-0 text-ink-400" />
                  <button
                    className="min-w-0 flex-1 truncate text-left text-sm text-brand-700 hover:underline"
                    onClick={() => openAttachment(a)}
                  >
                    {a.file_name}
                  </button>
                  <span className="shrink-0 text-xs text-ink-400">{fileSize(a.file_size)}</span>
                  {!locked && (isAdmin || a.added_by === profile?.user_id) && (
                    <button
                      className="shrink-0 text-ink-400 hover:text-rose-600"
                      aria-label={`Remove ${a.file_name}`}
                      onClick={() => removeAttachment(a)}
                    >
                      <X size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {fileError && <p className="mt-1.5 text-sm text-rose-600">{fileError}</p>}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            Conversation ({comments.length})
          </p>
          {loadingComments ? (
            <Spinner label="Loading replies" />
          ) : comments.length === 0 ? (
            <p className="mt-1.5 text-sm text-ink-400">No replies yet.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {comments.map((c) => {
                const author = personOf(c.author_id)
                return (
                  <li
                    key={c.id}
                    className={`rounded-xl border p-3 ${
                      c.is_internal ? 'border-amber-200 bg-amber-50' : 'border-cream-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar name={author?.full_name} avatarUrl={author?.avatar_url} size={22} />
                      <span className="text-sm font-medium text-ink-800">
                        {author?.full_name ?? 'Someone'}
                      </span>
                      {c.is_internal && (
                        <Chip className="bg-amber-100 text-amber-800">
                          <Lock size={11} /> Internal note
                        </Chip>
                      )}
                      <span className="ml-auto text-xs text-ink-400">{relativeTime(c.created_at)}</span>
                      {(isAdmin || c.author_id === profile?.user_id) && (
                        <button
                          className="text-ink-400 hover:text-rose-600"
                          aria-label="Delete reply"
                          onClick={() => setConfirmDelete(c)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{c.body}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {locked ? (
        <p className="mt-4 rounded-xl border border-cream-300 bg-cream-50 p-3 text-sm text-ink-500">
          This ticket is closed.{' '}
          {isAdmin
            ? 'Set the status back to Open to carry on the conversation.'
            : 'Submit a new ticket if you need more help.'}
        </p>
      ) : (
        <div className="mt-4 border-t border-cream-300 pt-3">
          {isAdmin && (
            <label className="mb-2 flex items-center gap-2 text-sm text-ink-600">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              <Lock size={13} className="text-amber-600" />
              Internal note — only admins see this
            </label>
          )}
          <div className="flex items-end gap-2">
            <textarea
              className="input min-h-[76px] flex-1"
              placeholder={internal ? 'Note for the admin team…' : 'Write a reply…'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              className="btn-primary"
              disabled={!draft.trim() || addComment.isPending}
              onClick={post}
            >
              <Send size={15} /> {internal ? 'Add note' : 'Reply'}
            </button>
          </div>
          {!isAdmin && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-400">
              <MessageSquare size={12} /> An admin is notified as soon as you reply.
            </p>
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this reply?"
          message="It disappears from the thread for everyone. This cannot be undone."
          busy={deleteComment.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            deleteComment.mutate({ id: confirmDelete.id, ticketId: ticket.id })
            setConfirmDelete(null)
          }}
        />
      )}
    </Modal>
  )
}
