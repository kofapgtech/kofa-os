import { supabase } from './supabaseClient'
import type { AppNotification } from './types'

/**
 * Resolves a notification to the in-app URL it's about. A few entity types
 * (task, workstream_budget_request, deliverable, ticket) only carry their own id,
 * not the project they live under, so those need a lookup before we can
 * build a route. Returns null when there's nothing sensible to navigate to.
 */
export async function resolveNotificationHref(n: AppNotification): Promise<string | null> {
  if (!n.entity_type || !n.entity_id) return null

  // Timesheet weeks are the one case where the same entity has two homes:
  // the approver's queue and the person's own timesheet. The notification
  // type, not the entity, says which one the reader wants.
  if (n.entity_type === 'timesheet_week') {
    return n.type === 'timesheet_submitted'
      ? `/timesheet/approvals?week=${n.entity_id}`
      : `/timesheet?week=${n.entity_id}`
  }

  switch (n.entity_type) {
    case 'project':
      return `/projects/${n.entity_id}?tab=budget`

    case 'task':
    case 'subtask': {
      const { data } = await supabase
        .from('tasks')
        .select('project_id')
        .eq('id', n.entity_id)
        .maybeSingle()
      if (!data?.project_id) return null
      return `/projects/${data.project_id}?tab=tasks&task=${n.entity_id}`
    }

    case 'workstream_budget_request': {
      const { data } = await supabase
        .from('workstream_budget_requests')
        .select('project_id')
        .eq('id', n.entity_id)
        .maybeSingle()
      if (!data?.project_id) return null
      return `/projects/${data.project_id}?tab=budget&request=${n.entity_id}`
    }

    case 'deliverable': {
      const { data } = await supabase
        .from('deliverables')
        .select('project_id')
        .eq('id', n.entity_id)
        .maybeSingle()
      if (!data?.project_id) return null
      return `/projects/${data.project_id}?tab=deliverables&deliverable=${n.entity_id}`
    }

    // Tickets have two homes for the same row: the submitter's own list and
    // the admin queue. Which one the reader wants follows from whether the
    // ticket is theirs, not from the notification type - an admin who also
    // raised the ticket should land on their own copy.
    case 'ticket': {
      const [{ data: ticket }, { data: auth }] = await Promise.all([
        supabase.from('tickets').select('submitted_by').eq('id', n.entity_id).maybeSingle(),
        supabase.auth.getUser(),
      ])
      if (!ticket) return null
      return ticket.submitted_by === auth.user?.id
        ? `/tickets?ticket=${n.entity_id}`
        : `/tickets/manage?ticket=${n.entity_id}`
    }

    default:
      return null
  }
}
