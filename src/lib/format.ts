import type { AccountStatus, DeliverableStage, ProjectStatus, TaskPriority, TaskStatus } from './types'

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
  todo: 'bg-cream-200 text-ink-600',
  in_progress: 'bg-sky-100 text-sky-800',
  blocked: 'bg-rose-100 text-rose-700',
  in_review: 'bg-accent-100 text-accent-700',
  done: 'bg-brand-100 text-brand-700',
}

export const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: 'bg-cream-200 text-ink-500',
  medium: 'bg-sky-100 text-sky-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-rose-100 text-rose-700',
}

/** Plain text-color version of PRIORITY_CLASS, for use inside <option>
 *  elements where a background utility won't reliably render. */
export const PRIORITY_OPTION_CLASS: Record<TaskPriority, string> = {
  low: 'text-ink-500',
  medium: 'text-sky-700',
  high: 'text-orange-700',
  urgent: 'text-rose-700 font-semibold',
}

export const PROJECT_STATUS: ProjectStatus[] = ['planning', 'active', 'on_hold', 'completed', 'archived']

export const PROJECT_STATUS_CLASS: Record<ProjectStatus, string> = {
  planning: 'bg-cream-200 text-ink-600',
  active: 'bg-brand-100 text-brand-700',
  on_hold: 'bg-accent-100 text-accent-700',
  completed: 'bg-sky-100 text-sky-800',
  archived: 'bg-cream-200 text-ink-400',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  archived: 'Archived',
}

export const ACCOUNT_STATUS: AccountStatus[] = ['prospect', 'active', 'paused', 'closed']

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  prospect: 'Prospect',
  active: 'Active',
  paused: 'Paused',
  closed: 'Closed',
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
  draft: 'bg-cream-200 text-ink-600',
  internal_review: 'bg-sky-100 text-sky-800',
  client_review: 'bg-accent-100 text-accent-700',
  approved: 'bg-brand-100 text-brand-700',
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
    return { bar: 'bg-ink-300', text: 'text-ink-500', label: 'Hidden' }
  if (value >= 100) return { bar: 'bg-rose-500', text: 'text-rose-700', label: 'Over budget' }
  if (value >= 90) return { bar: 'bg-orange-500', text: 'text-orange-800', label: 'Critical' }
  if (value >= 75) return { bar: 'bg-accent-400', text: 'text-accent-700', label: 'Watch' }
  return { bar: 'bg-brand-500', text: 'text-brand-700', label: 'Healthy' }
}
