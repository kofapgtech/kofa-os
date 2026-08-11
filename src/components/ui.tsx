import type { ReactNode } from 'react'
import { burnTone, initials } from '@/lib/format'

export function Chip({ className = '', children }: { className?: string; children: ReactNode }) {
  return <span className={`chip ${className}`}>{children}</span>
}

export function Avatar({ name, size = 28 }: { name: string | null | undefined; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-brand-100 text-brand-700 font-semibold shrink-0"
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
  tone = 'text-slate-900',
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
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

/** Budget burn bar. A null percentage means the viewer isn't cleared for money. */
export function BurnBar({ percent, showLabel = true }: { percent: number | null; showLabel?: boolean }) {
  const tone = burnTone(percent)
  const width = Math.min(100, Math.max(0, percent ?? 0))
  return (
    <div className="w-full">
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
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

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
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
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
