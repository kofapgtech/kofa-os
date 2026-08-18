import { CheckCheck, CircleDollarSign, FileCheck2, ListChecks } from 'lucide-react'
import { useNotifications } from '@/contexts/NotificationsContext'
import { EmptyState, PageHeader } from '@/components/ui'
import { relativeTime } from '@/lib/format'
import type { NotificationType } from '@/lib/types'

function iconFor(type: NotificationType) {
  if (type === 'budget_threshold') return <CircleDollarSign size={18} className="text-amber-600" />
  if (type === 'task_assigned') return <ListChecks size={18} className="text-brand-600" />
  return <FileCheck2 size={18} className="text-brand-600" />
}

export function NotificationsPage() {
  const { items, unread, markRead, markAllRead } = useNotifications()

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : 'All caught up'}
        actions={
          items.length > 0 && (
            <button className="btn-ghost" onClick={() => void markAllRead()}>
              <CheckCheck size={16} /> Mark all read
            </button>
          )
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nothing here yet."
          hint="Task assignments, review requests, and budget alerts land here."
        />
      ) : (
        <div className="card divide-y divide-cream-200">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => void markRead(n.id)}
              className={`flex w-full gap-3 px-4 py-3.5 text-left hover:bg-cream-100 ${
                n.read_at ? '' : 'bg-brand-50/40'
              }`}
            >
              <span className="mt-0.5">{iconFor(n.type)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-900">{n.title}</span>
                {n.body && <span className="block text-sm text-ink-500">{n.body}</span>}
                <span className="mt-0.5 block text-xs text-ink-400">{relativeTime(n.created_at)}</span>
              </span>
              {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
