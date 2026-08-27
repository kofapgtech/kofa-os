import { supabase } from './supabaseClient'
import type { AppNotification } from './types'

/**
 * Resolves a notification to the in-app URL it's about. A few entity types
 * (task, workstream_budget_request, deliverable) only carry their own id,
 * not the project they live under, so those need a lookup before we can
 * build a route. Returns null when there's nothing sensible to navigate to.
 */
export async function resolveNotificationHref(n: AppNotification): Promise<string | null> {
  if (!n.entity_type || !n.entity_id) return null

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

    default:
      return null
  }
}
