import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useNotifications } from '@/contexts/NotificationsContext'
import { iconForNotification } from '@/lib/notificationIcons'
import { resolveNotificationHref } from '@/lib/notificationLink'
import { relativeTime } from '@/lib/format'
import type { AppNotification } from '@/lib/types'

export function NotificationBell() {
  const { items, unread, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  async function openNotification(n: AppNotification) {
    setOpen(false)
    void markRead(n.id)
    const href = await resolveNotificationHref(n)
    if (href) navigate(href)
  }

  return (
    <div className="relative">
      <button className="btn-onbrand relative !px-2.5" onClick={() => setOpen((v) => !v)} title="Notifications">
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-[18px] text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-96 card overflow-hidden">
          <div className="flex items-center justify-between border-b border-cream-300 px-4 py-2.5">
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
              <p className="px-4 py-8 text-center text-sm text-ink-500">Nothing yet.</p>
            )}
            {items.slice(0, 40).map((n) => (
              <button
                key={n.id}
                onClick={() => void openNotification(n)}
                className={`flex w-full gap-3 border-b border-cream-200 px-4 py-3 text-left hover:bg-cream-100 ${
                  n.read_at ? '' : 'bg-brand-50/40'
                }`}
              >
                <span className="mt-0.5">{iconForNotification(n.type)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink-900">{n.title}</span>
                  {n.body && <span className="block text-xs text-ink-500">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-ink-400">
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
            className="block border-t border-cream-300 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-cream-100"
          >
            See all
          </Link>
        </div>
      )}
    </div>
  )
}
