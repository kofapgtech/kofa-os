import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LifeBuoy, Paperclip, Plus, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { useAddTicketAttachment, useCreateTicket, useTicketAttachmentCounts, useTickets } from '@/lib/queries'
import {
  TICKET_CATEGORY_LABEL,
  TICKET_CATEGORY_ORDER,
  TICKET_PRIORITY_CLASS,
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITY_ORDER,
  TICKET_STATUS_CLASS,
  TICKET_STATUS_LABEL,
  fileSize,
  relativeTime,
  shortDate,
} from '@/lib/format'
import type { Ticket, TicketCategory, TicketPriority } from '@/lib/types'
import { Chip, EmptyState, Modal, ModalHeader, PageHeader, Spinner } from '@/components/ui'
import { TICKET_BUCKET, TicketPanel } from '@/components/TicketPanel'

/**
 * The non-admin side of ticketing: raise a request, then follow it. The list
 * is whatever `useTickets()` returns, which for a non-admin is already only
 * their own submissions — the filter lives in the `tickets_read` policy, not
 * here, so this page can't accidentally widen it.
 */
export function Tickets() {
  const { data: tickets = [], isLoading } = useTickets()
  const { data: counts = {} } = useTicketAttachmentCounts()
  const [params, setParams] = useSearchParams()
  const [composing, setComposing] = useState(false)

  // ?ticket=<id> — how a notification opens the exact ticket it is about.
  const openId = params.get('ticket')
  const open = tickets.find((t) => t.id === openId) ?? null

  function show(t: Ticket | null) {
    const next = new URLSearchParams(params)
    if (t) next.set('ticket', t.id)
    else next.delete('ticket')
    setParams(next, { replace: true })
  }

  const live = tickets.filter((t) => t.status !== 'closed')
  const closed = tickets.filter((t) => t.status === 'closed')
  const awaitingYou = tickets.filter((t) => t.status === 'resolved')

  return (
    <>
      <PageHeader
        title="Submit a ticket"
        subtitle="Raise a request with the admin team and follow it here."
        actions={
          <button className="btn-primary" onClick={() => setComposing(true)}>
            <Plus size={16} /> New ticket
          </button>
        }
      />

      {awaitingYou.length > 0 && (
        <div className="card mb-4 border-brand-200 bg-brand-50 p-4">
          <p className="text-sm font-medium text-ink-800">
            {awaitingYou.length === 1
              ? '1 ticket has been marked resolved'
              : `${awaitingYou.length} tickets have been marked resolved`}
          </p>
          <p className="mt-0.5 text-sm text-ink-600">
            Open it to confirm it is sorted, or reopen it if it isn't.
          </p>
        </div>
      )}

      {isLoading ? (
        <Spinner label="Loading your tickets" />
      ) : tickets.length === 0 ? (
        <EmptyState
          title="No tickets yet"
          hint="Something broken, missing or unclear? Raise it here and an admin picks it up."
        />
      ) : (
        <div className="space-y-6">
          <TicketList tickets={live} counts={counts} onOpen={show} emptyLabel="Nothing open right now." />
          {closed.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
                Closed ({closed.length})
              </p>
              <TicketList tickets={closed} counts={counts} onOpen={show} emptyLabel="" />
            </div>
          )}
        </div>
      )}

      {open && <TicketPanel ticket={open} onClose={() => show(null)} />}
      {composing && <NewTicketModal onClose={() => setComposing(false)} onCreated={show} />}
    </>
  )
}

function TicketList({
  tickets,
  counts,
  onOpen,
  emptyLabel,
}: {
  tickets: Ticket[]
  counts: Record<string, number>
  onOpen: (t: Ticket) => void
  emptyLabel: string
}) {
  if (tickets.length === 0) {
    return emptyLabel ? <p className="text-sm text-ink-400">{emptyLabel}</p> : null
  }
  return (
    <ul className="space-y-2">
      {tickets.map((t) => (
        <li key={t.id}>
          <button
            className="card flex w-full items-center gap-3 p-4 text-left hover:border-brand-300"
            onClick={() => onOpen(t)}
          >
            <span className="shrink-0 text-sm font-semibold text-ink-400">#{t.ticket_number}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-900">{t.subject}</span>
              <span className="mt-0.5 block text-xs text-ink-500">
                {TICKET_CATEGORY_LABEL[t.category]} · raised {shortDate(t.created_at)} · updated{' '}
                {relativeTime(t.updated_at)}
              </span>
            </span>
            {counts[t.id] > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-xs text-ink-400">
                <Paperclip size={13} /> {counts[t.id]}
              </span>
            )}
            <Chip className={`shrink-0 ${TICKET_PRIORITY_CLASS[t.priority]}`}>
              {TICKET_PRIORITY_LABEL[t.priority]}
            </Chip>
            <Chip className={`shrink-0 ${TICKET_STATUS_CLASS[t.status]}`}>
              {TICKET_STATUS_LABEL[t.status]}
            </Chip>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Files are staged in local state and uploaded only after the ticket row
 * exists — the storage path and the attachment row both need the ticket id,
 * and a half-uploaded file with no ticket to hang off would be orphaned in
 * the bucket.
 */
function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Ticket) => void }) {
  const { profile } = useAuth()
  const create = useCreateTicket()
  const addAttachment = useAddTicketAttachment()

  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TicketCategory>('it_support')
  const [priority, setPriority] = useState<TicketPriority>('normal')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const ready = useMemo(
    () => subject.trim().length > 0 && description.trim().length > 0,
    [subject, description],
  )

  async function submit() {
    if (!profile || !ready) return
    setError(null)
    setBusy(true)
    try {
      const ticket = await create.mutateAsync({
        org_id: profile.org_id,
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        submitted_by: profile.user_id,
      })

      for (const file of files) {
        const path = `${ticket.org_id}/${ticket.id}/${Date.now()}-${file.name}`
        const { error: uploadError } = await supabase.storage
          .from(TICKET_BUCKET)
          .upload(path, file, { contentType: file.type })
        if (uploadError) throw uploadError
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

      onClose()
      onCreated(ticket)
    } catch (err) {
      // The ticket itself may well have been created — say so rather than
      // implying nothing happened, so nobody submits the same thing twice.
      setError(
        err instanceof Error
          ? `${err.message} — if the ticket was created you can attach the files from the ticket itself.`
          : "Couldn't submit the ticket",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-xl">
      <ModalHeader title="New ticket" icon={<LifeBuoy size={18} />} onClose={onClose} />

      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-ink-700">
          What do you need?
          <input
            className="input mt-1"
            placeholder="Laptop won't connect to the VPN"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink-700">
            Category
            <select
              className="input mt-1"
              value={category}
              onChange={(e) => setCategory(e.target.value as TicketCategory)}
            >
              {TICKET_CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {TICKET_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-ink-700">
            Priority
            <select
              className="input mt-1"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
            >
              {TICKET_PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium text-ink-700">
          Details
          <textarea
            className="input mt-1 min-h-[120px]"
            placeholder="What happened, what you already tried, and anything that would help someone reproduce it."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink-700">Attachments</span>
            <button className="btn-ghost !py-1 !text-xs" onClick={() => fileInput.current?.click()}>
              <Paperclip size={14} /> Add file
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
                if (fileInput.current) fileInput.current.value = ''
              }}
            />
          </div>
          {files.length === 0 ? (
            <p className="mt-1 text-xs text-ink-400">A screenshot usually saves a round trip.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-cream-300 px-2.5 py-1.5 text-sm"
                >
                  <Paperclip size={14} className="shrink-0 text-ink-400" />
                  <span className="min-w-0 flex-1 truncate text-ink-700">{f.name}</span>
                  <span className="shrink-0 text-xs text-ink-400">{fileSize(f.size)}</span>
                  <button
                    className="shrink-0 text-ink-400 hover:text-rose-600"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button className="btn-primary w-full" disabled={!ready || busy} onClick={submit}>
          {busy ? 'Submitting…' : 'Submit ticket'}
        </button>
      </div>
    </Modal>
  )
}
