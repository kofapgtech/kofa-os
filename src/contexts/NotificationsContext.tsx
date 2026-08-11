import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { AppNotification } from '@/lib/types'
import { useAuth } from './AuthContext'

interface NotificationsContextValue {
  items: AppNotification[]
  unread: number
  /** Newly arrived items, shown as toasts and dismissed on a timer. */
  toasts: AppNotification[]
  dismissToast: (id: string) => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [items, setItems] = useState<AppNotification[]>([])
  const [toasts, setToasts] = useState<AppNotification[]>([])

  useEffect(() => {
    if (!user) {
      setItems([])
      return
    }

    let cancelled = false

    async function load() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (!cancelled) setItems((data as AppNotification[]) ?? [])
    }
    void load()

    // Realtime is what makes a budget alert land on screen mid-demo.
    const channel = supabase
      .channel('notifications-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as AppNotification
          setItems((prev) => [row, ...prev])
          setToasts((prev) => [...prev, row])
          window.setTimeout(
            () => setToasts((prev) => prev.filter((t) => t.id !== row.id)),
            7000,
          )
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [user])

  async function markRead(id: string) {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)))
    await supabase.from('notifications').update({ read_at: now }).eq('id', id)
  }

  async function markAllRead() {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
    await supabase.from('notifications').update({ read_at: now }).is('read_at', null)
  }

  const value: NotificationsContextValue = {
    items,
    unread: items.filter((n) => !n.read_at).length,
    toasts,
    dismissToast: (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    markRead,
    markAllRead,
  }

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider')
  return ctx
}
