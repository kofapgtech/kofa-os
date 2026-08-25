import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { iconForNotification } from '@/lib/notificationIcons'
import type { AppNotification } from '@/lib/types'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

interface NotificationsContextValue {
  items: AppNotification[]
  unread: number
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState<AppNotification[]>([])

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

    // Realtime is what makes a budget alert land on screen mid-demo. Fed
    // into the shared toast stack (see ToastContext), so it appears
    // alongside — not competing with — action-feedback toasts.
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
          toast.push({
            variant: 'info',
            title: row.title,
            body: row.body ?? undefined,
            icon: iconForNotification(row.type),
            duration: 7000,
          })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
