import type { DeliverableStage, ProjectStatus, TaskPriority, TaskStatus } from './types'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** Money is null for staff by design — show a lock, not a zero. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return currency.format(value)
}

export function hours(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}h`
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Math.round(Number(value))}%`
}

export function minutesToHours(minutes: number | null | undefined): number {
  if (!minutes) return 0
  return Math.round((minutes / 60) * 100) / 100
}

/** 95 -> "1:35" for the running-timer readout. */
export function minutesToClock(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.floor(totalMinutes % 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function longDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function relativeTime(value: string): string {
  const then = new Date(value).getTime()
  const diffMin = Math.round((Date.now() - then) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return longDate(value)
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  in_review: 'In review',
  done: 'Done',
}

export const TASK_STATUS_ORDER: TaskStatus[] = [
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
]

export const TASK_STATUS_CLASS: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-brand-100 text-brand-700',
  blocked: 'bg-rose-100 text-rose-700',
  in_review: 'bg-amber-100 text-amber-800',
  done: 'bg-emerald-100 text-emerald-700',
}

export const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-sky-100 text-sky-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-rose-100 text-rose-700',
}

export const PROJECT_STATUS_CLASS: Record<ProjectStatus, string> = {
  planning: 'bg-slate-100 text-slate-700',
  active: 'bg-emerald-100 text-emerald-700',
  on_hold: 'bg-amber-100 text-amber-800',
  completed: 'bg-brand-100 text-brand-700',
  archived: 'bg-slate-100 text-slate-500',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  archived: 'Archived',
}

export const STAGE_LABEL: Record<DeliverableStage, string> = {
  draft: 'Draft',
  internal_review: 'Internal review',
  client_review: 'Client review',
  approved: 'Approved',
  revisions_requested: 'Revisions requested',
}

export const STAGE_ORDER: DeliverableStage[] = [
  'draft',
  'internal_review',
  'client_review',
  'approved',
  'revisions_requested',
]

export const STAGE_CLASS: Record<DeliverableStage, string> = {
  draft: 'bg-slate-100 text-slate-700',
  internal_review: 'bg-brand-100 text-brand-700',
  client_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-700',
  revisions_requested: 'bg-rose-100 text-rose-700',
}

/** Budget health drives colour everywhere it appears. */
export function burnTone(percent: number | null | undefined): {
  bar: string
  text: string
  label: string
} {
  const value = percent ?? 0
  if (percent === null || percent === undefined)
    return { bar: 'bg-slate-300', text: 'text-slate-500', label: 'Hidden' }
  if (value >= 100) return { bar: 'bg-rose-500', text: 'text-rose-700', label: 'Over budget' }
  if (value >= 90) return { bar: 'bg-orange-500', text: 'text-orange-700', label: 'Critical' }
  if (value >= 75) return { bar: 'bg-amber-500', text: 'text-amber-700', label: 'Watch' }
  return { bar: 'bg-emerald-500', text: 'text-emerald-700', label: 'Healthy' }
}
