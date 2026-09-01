import {
  Building2,
  CalendarCheck,
  CircleDollarSign,
  FileCheck2,
  Hourglass,
  ListChecks,
} from 'lucide-react'
import type { NotificationType } from './types'

/** Shared between the notification dropdown and the toast it also fires as. */
export function iconForNotification(type: NotificationType) {
  if (type === 'budget_threshold') return <CircleDollarSign size={16} className="text-amber-600" />
  if (type === 'task_assigned') return <ListChecks size={16} className="text-brand-600" />
  if (type === 'department_task_assigned') return <Building2 size={16} className="text-brand-600" />
  if (type === 'time_extension_requested' || type === 'time_extension_decided')
    return <Hourglass size={16} className="text-accent-700" />
  if (type === 'timesheet_submitted' || type === 'timesheet_decided')
    return <CalendarCheck size={16} className="text-sky-700" />
  return <FileCheck2 size={16} className="text-brand-600" />
}
