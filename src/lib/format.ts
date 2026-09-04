import type {
  AccountStatus,
  DeliverableStage,
  EmploymentType,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TimesheetWeekStatus,
  UserRole,
} from './types'

// Currency is a workspace setting, not a constant. A module-level formatter
// keeps all ~60 money() call sites untouched — the alternative was threading a
// currency prop through every component that shows a figure. It is a singleton,
// which is correct here because exactly one workspace is active per session;
// AppShell re-applies it whenever the active workspace changes.
let currencyCode = 'USD'
let currencyFmt = buildCurrencyFormat(currencyCode)

function buildCurrencyFormat(code: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    })
  } catch {
    // An unknown ISO code would otherwise throw on every render.
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    })
  }
}

/** Point every money() call at the active workspace's currency. Idempotent. */
export function setWorkspaceCurrency(code: string | null | undefined) {
  const next = (code ?? 'USD').toUpperCase()
  if (next === currencyCode) return
  currencyCode = next
  currencyFmt = buildCurrencyFormat(next)
}

export function workspaceCurrency(): string {
  return currencyCode
}

/** Money is null for staff by design — show a lock, not a zero. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return currencyFmt.format(value)
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

export const TIMESHEET_STATUS_LABEL: Record<TimesheetWeekStatus, string> = {
  draft: 'Open',
  pending_lead: 'With workstream lead',
  pending_md: 'With managing director',
  approved: 'Approved',
  rejected: 'Sent back',
}

/** The short form for a chip in a crowded table row. */
export const TIMESHEET_STATUS_SHORT: Record<TimesheetWeekStatus, string> = {
  draft: 'Open',
  pending_lead: 'Lead review',
  pending_md: 'MD review',
  approved: 'Approved',
  rejected: 'Sent back',
}

export const TIMESHEET_STATUS_CLASS: Record<TimesheetWeekStatus, string> = {
  draft: 'bg-cream-200 text-ink-600',
  pending_lead: 'bg-accent-100 text-accent-700',
  pending_md: 'bg-sky-100 text-sky-800',
  approved: 'bg-brand-100 text-brand-700',
  rejected: 'bg-rose-100 text-rose-700',
}

/** The Monday that starts the week a date falls in, as a YYYY-MM-DD string.
 *  UTC, to match timesheet_weeks.week_start on the server — a local-time
 *  version would disagree by a day for anyone west of Greenwich. */
export function weekStartOf(value: string | Date): string {
  const d = new Date(value)
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7))
  return utc.toISOString().slice(0, 10)
}

/** "Aug 24 – Aug 30" for a week_start. */
export function weekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`)
  const end = new Date(start.getTime() + 6 * 86_400_000)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt(start)} – ${fmt(end)}`
}

/** Budget health drives colour everywhere it appears. */
export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  executive: 'Executive',
  dept_lead: 'Department lead',
  hr_manager: 'HR',
  staff: 'Staff',
}

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  employee: 'Employee',
  contractor: 'Contractor',
}

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

// ------------------------------------------------------------------ tickets

export const TICKET_STATUS_ORDER: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed']

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const TICKET_STATUS_CLASS: Record<TicketStatus, string> = {
  open: 'bg-sky-100 text-sky-800',
  in_progress: 'bg-accent-100 text-accent-700',
  resolved: 'bg-brand-100 text-brand-700',
  closed: 'bg-cream-200 text-ink-500',
}

export const TICKET_PRIORITY_ORDER: TicketPriority[] = ['low', 'normal', 'high', 'urgent']

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

/** Mirrors PRIORITY_CLASS, but tickets use `normal` where a task uses
 *  `medium`, so the two maps can't be shared. */
export const TICKET_PRIORITY_CLASS: Record<TicketPriority, string> = {
  low: 'bg-cream-200 text-ink-500',
  normal: 'bg-sky-100 text-sky-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-rose-100 text-rose-700',
}

export const TICKET_CATEGORY_ORDER: TicketCategory[] = [
  'it_support',
  'access',
  'hr',
  'payroll',
  'facilities',
  'other',
]

export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  it_support: 'IT support',
  access: 'Access & accounts',
  hr: 'HR',
  payroll: 'Payroll',
  facilities: 'Facilities',
  other: 'Something else',
}

/** Human file size for an attachment row. */
export function fileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
