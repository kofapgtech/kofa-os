import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, CircleDollarSign, FileCheck2, ListChecks, X } from 'lucide-react'
import { useNotifications } from '@/contexts/NotificationsContext'
import { relativeTime } from '@/lib/format'
import type { NotificationType } from '@/lib/types'

function iconFor(type: NotificationType) {
  if (type === 'budget_threshold') return <CircleDollarSign size={16} className="text-amber-600" />
  if (type === 'task_assigned') return <ListChecks size={16} className="text-brand-600" />
  return <FileCheck2 size={16} className="text-emerald-600" />
}

export function NotificationBell() {
  const { items, unread, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button className="btn-ghost relative !px-2.5" onClick={() => setOpen((v) => !v)} title="Notifications">
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-[18px] text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-96 card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            <div className="flex items-center gap-1">
              <button
                className="btn-ghost !min-h-0 !px-2 !py-1 text-xs"
                onClick={() => void markAllRead()}
              >
                <CheckCheck size={14} /> Mark all read
              </button>
              <button className="btn-ghost !min-h-0 !px-2 !py-1" onClick={() => setOpen(false)}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing yet.</p>
            )}
            {items.slice(0, 40).map((n) => (
              <button
                key={n.id}
                onClick={() => void markRead(n.id)}
                className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                  n.read_at ? '' : 'bg-brand-50/40'
                }`}
              >
                <span className="mt-0.5">{iconFor(n.type)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                  {n.body && <span className="block text-xs text-slate-500">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {relativeTime(n.created_at)}
                  </span>
                </span>
                {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
              </button>
            ))}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-slate-50"
          >
            See all
          </Link>
        </div>
      )}
    </div>
  )
}

/** Live toasts, driven by the Supabase Realtime subscription. */
export function NotificationToasts() {
  const { toasts, dismissToast } = useNotifications()
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto card flex gap-3 p-3.5 shadow-lg ring-1 ring-slate-900/5 animate-[fadeIn_.2s_ease-out]"
        >
          <span className="mt-0.5">{iconFor(t.type)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{t.title}</p>
            {t.body && <p className="text-xs text-slate-600">{t.body}</p>}
          </div>
          <button className="text-slate-400 hover:text-slate-600" onClick={() => dismissToast(t.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
