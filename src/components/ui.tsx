import { useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, ChevronsUpDown, X } from 'lucide-react'
import { burnTone, initials } from '@/lib/format'

/** Standard header row for a Modal: icon + title + close button. */
export function ModalHeader({ title, icon, onClose }: { title: string; icon: ReactNode; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-start justify-between print:hidden">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-semibold text-ink-900">{title}</p>
      </div>
      <button className="btn-ghost !px-2.5" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  )
}

export function Chip({ className = '', children }: { className?: string; children: ReactNode }) {
  return <span className={`chip ${className}`}>{children}</span>
}

export function Avatar({
  name,
  avatarUrl,
  size = 28,
  onBrand = false,
}: {
  name: string | null | undefined
  /** Photo URL (`profiles.avatar_url`) — falls back to initials when absent. */
  avatarUrl?: string | null
  size?: number
  /** Inverts the colours for use on the green header. */
  onBrand?: boolean
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? ''}
        title={name ?? undefined}
        className="inline-block shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 ${
        onBrand ? 'bg-cream-100 text-brand-700' : 'bg-brand-100 text-brand-700'
      }`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      title={name ?? undefined}
    >
      {initials(name)}
    </span>
  )
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'text-ink-900',
  icon,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: string
  icon?: ReactNode
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
        {icon && <span className="text-ink-400">{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </div>
  )
}

/** Budget burn bar. A null percentage means the viewer isn't cleared for money. */
export function BurnBar({ percent, showLabel = true }: { percent: number | null; showLabel?: boolean }) {
  const tone = burnTone(percent)
  const width = Math.min(100, Math.max(0, percent ?? 0))
  return (
    <div className="w-full">
      <div className="h-2 w-full rounded-full bg-cream-200 overflow-hidden">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${width}%` }} />
      </div>
      {showLabel && (
        <p className={`mt-1 text-xs font-medium ${tone.text}`}>
          {percent === null ? 'Restricted' : `${Math.round(percent)}% · ${tone.label}`}
        </p>
      )}
    </div>
  )
}

/** Shared overlay shell for modal dialogs: backdrop + centered card, with
 *  print-friendly classes so a caller can offer a "print this" action. */
export function Modal({
  onClose,
  children,
  className = 'max-w-lg',
}: {
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 print:static print:block print:p-0">
      <div className="absolute inset-0 bg-brand-800/30 print:hidden" onClick={onClose} />
      <div className={`card relative w-full p-5 print:border-0 print:shadow-none ${className}`}>{children}</div>
    </div>
  )
}

/**
 * In-brand replacement for `window.confirm` — used for every "this can't be
 * undone" action in the app (deleting an account, a project, a deliverable,
 * ...). Renders above everything else, including a Modal already on screen,
 * since a delete confirmation is usually triggered from inside one.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red/outline "danger" styling for a destructive action vs. plain brand styling. */
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div className="absolute inset-0 bg-brand-800/40" onClick={onCancel} />
      <div className="card relative w-full max-w-sm p-5">
        <div className="flex items-start gap-3">
          {danger && (
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600">
              <AlertTriangle size={17} />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">{title}</p>
            <p className="mt-1.5 text-sm text-ink-600">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-500">{hint}</p>}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-ink-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-cream-400 border-t-brand-600" />
      {label}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// --------------------------------------------------------------- sorting

export type SortDir = 'asc' | 'desc'

/** Local (client-side) sort state for a table. Give each column a string key;
 *  clicking the same key again flips direction, clicking a new key resets to asc. */
export function useTableSort<K extends string>(initialKey: K | null = null, initialDir: SortDir = 'asc') {
  const [sortKey, setSortKey] = useState<K | null>(initialKey)
  const [sortDir, setSortDir] = useState<SortDir>(initialDir)

  function toggleSort(key: K) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return { sortKey, sortDir, toggleSort }
}

/** Sorts `rows` by the value `accessor` returns for `sortKey`, stably (ties keep
 *  their original order) and pushing nullish values to the end regardless of direction. */
export function sortRows<T, K extends string>(
  rows: T[],
  sortKey: K | null,
  sortDir: SortDir,
  accessor: (row: T, key: K) => string | number | boolean | null | undefined,
): T[] {
  if (!sortKey) return rows
  return rows
    .map((row, index) => ({ row, index, value: accessor(row, sortKey) }))
    .sort((a, b) => {
      const aNil = a.value === null || a.value === undefined
      const bNil = b.value === null || b.value === undefined
      if (aNil && bNil) return a.index - b.index
      if (aNil) return 1
      if (bNil) return -1

      let cmp: number
      if (typeof a.value === 'number' && typeof b.value === 'number') {
        cmp = a.value - b.value
      } else if (typeof a.value === 'boolean' && typeof b.value === 'boolean') {
        cmp = Number(a.value) - Number(b.value)
      } else {
        cmp = String(a.value).localeCompare(String(b.value), undefined, { numeric: true, sensitivity: 'base' })
      }
      if (cmp === 0) cmp = a.index - b.index
      return sortDir === 'asc' ? cmp : -cmp
    })
    .map((x) => x.row)
}

/** A `<th>` whose whole label + arrow acts as one sort toggle button — click the
 *  text or the arrow, same effect. Drop-in replacement for `<th className="th">Label</th>`. */
export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  align = 'left',
  className = '',
  thClassName = 'th',
}: {
  label: ReactNode
  sortKey: K
  sort: { sortKey: K | null; sortDir: SortDir; toggleSort: (key: K) => void }
  align?: 'left' | 'right' | 'center'
  className?: string
  /** Overrides the default `.th` class — for headers styled some other way (e.g. inheriting from `<tr>`). */
  thClassName?: string
}) {
  const active = sort.sortKey === sortKey
  const Icon = active ? (sort.sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown

  return (
    <th className={`${thClassName} ${className}`}>
      <button
        type="button"
        onClick={() => sort.toggleSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-ink-800 ${
          align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : ''
        } ${active ? 'text-ink-800' : ''}`}
      >
        <span>{label}</span>
        <Icon size={12} className={active ? 'text-brand-600' : 'text-ink-300'} />
      </button>
    </th>
  )
}

