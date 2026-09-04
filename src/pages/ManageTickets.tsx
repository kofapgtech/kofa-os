import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Inbox, LifeBuoy, Paperclip, Search, Trash2, UserCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDeleteTicket, useProfiles, useTicketAttachmentCounts, useTickets } from '@/lib/queries'
import {
  TICKET_CATEGORY_LABEL,
  TICKET_CATEGORY_ORDER,
  TICKET_PRIORITY_CLASS,
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITY_ORDER,
  TICKET_STATUS_CLASS,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_ORDER,
  relativeTime,
  shortDate,
} from '@/lib/format'
import type { Ticket, TicketCategory, TicketPriority, TicketStatus } from '@/lib/types'
import {
  Avatar,
  Chip,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  SortableTh,
  Spinner,
  StatCard,
  sortRows,
  useTableSort,
} from '@/components/ui'
import { TicketPanel } from '@/components/TicketPanel'

type Col = 'number' | 'subject' | 'submitter' | 'category' | 'priority' | 'status' | 'updated'

/** Urgent first when sorting by priority, which is the order an admin
 *  actually wants — TICKET_PRIORITY_ORDER runs the other way for pickers. */
const PRIORITY_RANK: Record<TicketPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
const STATUS_RANK: Record<TicketStatus, number> = { open: 0, in_progress: 1, resolved: 2, closed: 3 }

/**
 * The admin queue. Everything an admin can do to a ticket beyond triage
 * lives in TicketPanel — this page is about finding the right ticket and
 * seeing what is unattended.
 */
export function ManageTickets() {
  const { profile } = useAuth()
  const { data: tickets = [], isLoading } = useTickets()
  const { data: people = [] } = useProfiles()
  const { data: counts = {} } = useTicketAttachmentCounts()
  const remove = useDeleteTicket()
  const sort = useTableSort<Col>('status')

  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  // Closed tickets are hidden by default: the queue is a to-do list, and a
  // finished ticket is only ever wanted deliberately.
  const [status, setStatus] = useState<TicketStatus | 'all' | 'live'>('live')
  const [priority, setPriority] = useState<TicketPriority | 'all'>('all')
  const [category, setCategory] = useState<TicketCategory | 'all'>('all')
  const [owner, setOwner] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [confirmDelete, setConfirmDelete] = useState<Ticket | null>(null)

  const openId = params.get('ticket')
  const open = tickets.find((t) => t.id === openId) ?? null

  function show(t: Ticket | null) {
    const next = new URLSearchParams(params)
    if (t) next.set('ticket', t.id)
    else next.delete('ticket')
    setParams(next, { replace: true })
  }

  const personOf = useMemo(() => {
    const map = new Map(people.map((p) => [p.user_id, p]))
    return (id: string | null) => (id ? map.get(id) ?? null : null)
  }, [people])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = tickets.filter((t) => {
      if (status === 'live' ? t.status === 'closed' : status !== 'all' && t.status !== status) return false
      if (priority !== 'all' && t.priority !== priority) return false
      if (category !== 'all' && t.category !== category) return false
      if (owner === 'mine' && t.assigned_to !== profile?.user_id) return false
      if (owner === 'unassigned' && t.assigned_to !== null) return false
      if (!q) return true
      const who = personOf(t.submitted_by)?.full_name ?? ''
      return (
        t.subject.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        who.toLowerCase().includes(q) ||
        `#${t.ticket_number}`.includes(q)
      )
    })

    return sortRows(filtered, sort.sortKey, sort.sortDir, (t, key) => {
      if (key === 'number') return t.ticket_number
      if (key === 'subject') return t.subject
      if (key === 'submitter') return personOf(t.submitted_by)?.full_name ?? ''
      if (key === 'category') return TICKET_CATEGORY_LABEL[t.category]
      if (key === 'priority') return PRIORITY_RANK[t.priority]
      if (key === 'status') return STATUS_RANK[t.status]
      return t.updated_at
    })
  }, [
    tickets,
    query,
    status,
    priority,
    category,
    owner,
    profile?.user_id,
    personOf,
    sort.sortKey,
    sort.sortDir,
  ])

  const unassigned = tickets.filter((t) => t.status !== 'closed' && !t.assigned_to).length
  const openCount = tickets.filter((t) => t.status === 'open').length
  const inProgress = tickets.filter((t) => t.status === 'in_progress').length
  const urgent = tickets.filter((t) => t.status !== 'closed' && t.priority === 'urgent').length

  return (
    <>
      <PageHeader
        title="Manage tickets"
        subtitle="Every request raised in this workspace."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open" value={openCount} icon={<Inbox size={16} />} />
        <StatCard label="In progress" value={inProgress} icon={<LifeBuoy size={16} />} />
        <StatCard
          label="Unassigned"
          value={unassigned}
          tone={unassigned > 0 ? 'text-orange-700' : 'text-ink-900'}
          sub={unassigned > 0 ? 'Nobody has picked these up' : 'Everything has an owner'}
          icon={<UserCheck size={16} />}
        />
        <StatCard
          label="Urgent"
          value={urgent}
          tone={urgent > 0 ? 'text-rose-700' : 'text-ink-900'}
          icon={<AlertTriangle size={16} />}
        />
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input !pl-9"
            placeholder="Search subject, details, person or #number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input !w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value as TicketStatus | 'all' | 'live')}
        >
          <option value="live">Not closed</option>
          <option value="all">Every status</option>
          {TICKET_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {TICKET_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          className="input !w-auto"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TicketPriority | 'all')}
        >
          <option value="all">Any priority</option>
          {TICKET_PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {TICKET_PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select
          className="input !w-auto"
          value={category}
          onChange={(e) => setCategory(e.target.value as TicketCategory | 'all')}
        >
          <option value="all">Any category</option>
          {TICKET_CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {TICKET_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <select
          className="input !w-auto"
          value={owner}
          onChange={(e) => setOwner(e.target.value as 'all' | 'mine' | 'unassigned')}
        >
          <option value="all">Anyone</option>
          <option value="mine">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
      </div>

      {isLoading ? (
        <Spinner label="Loading tickets" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={tickets.length === 0 ? 'No tickets yet' : 'Nothing matches those filters'}
          hint={
            tickets.length === 0
              ? 'When someone submits a ticket it lands here and you are notified.'
              : 'Widen the status or priority filter to see more.'
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-cream-300">
                <SortableTh label="#" sortKey="number" sort={sort} />
                <SortableTh label="Subject" sortKey="subject" sort={sort} />
                <SortableTh label="Raised by" sortKey="submitter" sort={sort} />
                <SortableTh label="Category" sortKey="category" sort={sort} />
                <SortableTh label="Priority" sortKey="priority" sort={sort} />
                <SortableTh label="Status" sortKey="status" sort={sort} />
                <SortableTh label="Updated" sortKey="updated" sort={sort} />
                <th className="th">Owner</th>
                <th className="th sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const submitter = personOf(t.submitted_by)
                const assignee = personOf(t.assigned_to)
                return (
                  <tr
                    key={t.id}
                    className={`cursor-pointer border-b border-cream-200 hover:bg-cream-100 ${
                      t.status === 'closed' ? 'opacity-60' : ''
                    }`}
                    onClick={() => show(t)}
                  >
                    <td className="td tabular-nums text-ink-400">#{t.ticket_number}</td>
                    <td className="td">
                      <span className="flex items-center gap-1.5 font-medium text-ink-900">
                        <span className="max-w-[280px] truncate">{t.subject}</span>
                        {counts[t.id] > 0 && (
                          <span className="flex shrink-0 items-center gap-0.5 text-xs text-ink-400">
                            <Paperclip size={12} />
                            {counts[t.id]}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-ink-400">raised {shortDate(t.created_at)}</span>
                    </td>
                    <td className="td">
                      <span className="flex items-center gap-2">
                        <Avatar name={submitter?.full_name} avatarUrl={submitter?.avatar_url} size={22} />
                        <span className="text-ink-700">{submitter?.full_name ?? 'Unknown'}</span>
                      </span>
                    </td>
                    <td className="td text-ink-600">{TICKET_CATEGORY_LABEL[t.category]}</td>
                    <td className="td">
                      <Chip className={TICKET_PRIORITY_CLASS[t.priority]}>
                        {TICKET_PRIORITY_LABEL[t.priority]}
                      </Chip>
                    </td>
                    <td className="td">
                      <Chip className={TICKET_STATUS_CLASS[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Chip>
                    </td>
                    <td className="td whitespace-nowrap text-ink-500">{relativeTime(t.updated_at)}</td>
                    <td className="td">
                      {assignee ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={assignee.full_name} avatarUrl={assignee.avatar_url} size={22} />
                          <span className="text-ink-700">{assignee.full_name}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-orange-700">Unassigned</span>
                      )}
                    </td>
                    <td className="td">
                      <button
                        className="text-ink-400 hover:text-rose-600"
                        aria-label={`Delete ticket #${t.ticket_number}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDelete(t)
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && <TicketPanel ticket={open} onClose={() => show(null)} />}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ticket #${confirmDelete.ticket_number}?`}
          message="The whole thread, its internal notes and its attachments go with it. Closing it instead keeps the record."
          busy={remove.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            remove.mutate(confirmDelete.id)
            setConfirmDelete(null)
          }}
        />
      )}
    </>
  )
}
