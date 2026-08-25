import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  variant: ToastVariant
  title: string
  body?: string
  /** Overrides the variant's default icon — used by real-time notifications,
   *  which carry their own type-specific icon (budget, task, deliverable…). */
  icon?: ReactNode
  /** ms before auto-dismiss. Errors linger longer than success/info. */
  duration?: number
}

interface ToastContextValue {
  toasts: ToastItem[]
  push: (toast: Omit<ToastItem, 'id'>) => string
  dismiss: (id: string) => void
  success: (title: string, body?: string) => void
  error: (title: string, body?: string) => void
  info: (title: string, body?: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 5000,
  error: 7000,
}

/**
 * One shared toast stack for the whole app — mounted above the router so
 * it's available on Login and the anonymous client Portal too, not just
 * inside the authenticated shell. Real-time notifications and action
 * feedback (save succeeded, request failed…) both push into this same
 * queue, so there's a single consistent stack instead of two competing ones.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof window.setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = crypto.randomUUID()
      const duration = toast.duration ?? DEFAULT_DURATION[toast.variant]
      setToasts((prev) => [...prev, { ...toast, id }])
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), duration),
      )
      return id
    },
    [dismiss],
  )

  const success = useCallback((title: string, body?: string) => push({ variant: 'success', title, body }), [push])
  const error = useCallback((title: string, body?: string) => push({ variant: 'error', title, body }), [push])
  const info = useCallback((title: string, body?: string) => push({ variant: 'info', title, body }), [push])

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss, success, error, info }}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

function defaultIcon(variant: ToastVariant) {
  if (variant === 'success') return <CheckCircle2 size={16} className="text-brand-600" />
  if (variant === 'error') return <AlertCircle size={16} className="text-rose-600" />
  return <Info size={16} className="text-brand-600" />
}

function ToastViewport() {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.variant === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto card flex gap-3 p-3.5 shadow-lg ring-1 ring-ink-900/5 animate-[fadeIn_.2s_ease-out] ${
            t.variant === 'error' ? 'border-rose-200' : ''
          }`}
        >
          <span className="mt-0.5 shrink-0">{t.icon ?? defaultIcon(t.variant)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">{t.title}</p>
            {t.body && <p className="text-xs text-ink-600">{t.body}</p>}
          </div>
          <button className="shrink-0 text-ink-400 hover:text-ink-600" onClick={() => dismiss(t.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
