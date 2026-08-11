import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import type {
  Account,
  Deliverable,
  DeliverableReview,
  DeliverableStage,
  Department,
  DepartmentLoad,
  Profile,
  Project,
  ProjectBudget,
  ShareLink,
  Task,
  TimeEntry,
  UserUtilization,
} from './types'

/** Anything that changes hours also changes money — invalidate together. */
export const TIME_DEPENDENT_KEYS = [['budgets'], ['time-entries'], ['utilization'], ['dept-load']]

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  return (data ?? []) as T
}

// ---------------------------------------------------------------- reference

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('*').order('name')
      return unwrap<Department[]>(data, error)
    },
    staleTime: 5 * 60_000,
  })
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name')
      return unwrap<Profile[]>(data, error)
    },
    staleTime: 5 * 60_000,
  })
}

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*').order('name')
      return unwrap<Account[]>(data, error)
    },
  })
}

// ------------------------------------------------------------------ budgets

/**
 * v_project_budget. For staff every money column arrives as null because
 * RLS filters time_entry_costs — the UI renders that as "—", not as zero.
 */
export function useProjectBudgets() {
  return useQuery({
    queryKey: ['budgets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_project_budget')
        .select('*')
        .order('pct_amount', { ascending: false, nullsFirst: false })
      return unwrap<ProjectBudget[]>(data, error)
    },
  })
}

export function useProjectBudget(projectId: string | undefined) {
  return useQuery({
    queryKey: ['budgets', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_project_budget')
        .select('*')
        .eq('project_id', projectId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as ProjectBudget | null
    },
  })
}

export function useDepartmentLoad() {
  return useQuery({
    queryKey: ['dept-load'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_department_load').select('*').order('name')
      return unwrap<DepartmentLoad[]>(data, error)
    },
  })
}

export function useUtilization() {
  return useQuery({
    queryKey: ['utilization'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_user_utilization')
        .select('*')
        .order('week_start')
      return unwrap<UserUtilization[]>(data, error)
    },
  })
}

// ----------------------------------------------------------------- projects

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as Project | null
    },
  })
}

// -------------------------------------------------------------------- tasks

export function useTasks(projectId?: string) {
  return useQuery({
    queryKey: ['tasks', projectId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('tasks').select('*').order('position')
      if (projectId) q = q.eq('project_id', projectId)
      const { data, error } = await q
      return unwrap<Task[]>(data, error)
    },
  })
}

export function useTaskHours(projectId?: string) {
  return useQuery({
    queryKey: ['task-hours', projectId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('v_task_hours').select('*')
      if (projectId) q = q.eq('project_id', projectId)
      const { data, error } = await q
      const rows = unwrap<{ task_id: string; hours_logged: number }[]>(data, error)
      return Object.fromEntries(rows.map((r) => [r.task_id, r.hours_logged]))
    },
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { error } = await supabase.from('tasks').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
    },
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (task: Partial<Task> & { project_id: string; title: string; org_id: string }) => {
      const { error } = await supabase.from('tasks').insert(task)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
    },
  })
}

// ------------------------------------------------------------- deliverables

export function useDeliverables(projectId?: string) {
  return useQuery({
    queryKey: ['deliverables', projectId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('deliverables').select('*').order('due_date', { nullsFirst: false })
      if (projectId) q = q.eq('project_id', projectId)
      const { data, error } = await q
      return unwrap<Deliverable[]>(data, error)
    },
  })
}

export function useDeliverableReviews(deliverableId: string | undefined) {
  return useQuery({
    queryKey: ['reviews', deliverableId],
    enabled: !!deliverableId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliverable_reviews')
        .select('*')
        .eq('deliverable_id', deliverableId!)
        .order('created_at')
      return unwrap<DeliverableReview[]>(data, error)
    },
  })
}

/**
 * Stage changes go through the RPC, never a direct update — a database
 * trigger rejects a raw UPDATE on `stage` so the audit trail can't be skipped.
 */
export function useTransitionDeliverable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: string; toStage: DeliverableStage; comment?: string }) => {
      const { error } = await supabase.rpc('transition_deliverable', {
        p_deliverable_id: args.id,
        p_to_stage: args.toStage,
        p_comment: args.comment ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliverables'] })
      qc.invalidateQueries({ queryKey: ['reviews'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
    },
  })
}

// --------------------------------------------------------------------- time

export function useTimeEntries(opts: { projectId?: string; userId?: string; since?: string } = {}) {
  return useQuery({
    queryKey: ['time-entries', opts.projectId ?? '-', opts.userId ?? '-', opts.since ?? '-'],
    queryFn: async () => {
      let q = supabase
        .from('time_entries')
        .select('*')
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
      if (opts.projectId) q = q.eq('project_id', opts.projectId)
      if (opts.userId) q = q.eq('user_id', opts.userId)
      if (opts.since) q = q.gte('started_at', opts.since)
      const { data, error } = await q.limit(1000)
      return unwrap<TimeEntry[]>(data, error)
    },
  })
}

export function useLogTime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entry: {
      org_id: string
      project_id: string
      task_id: string | null
      user_id: string
      started_at: string
      ended_at: string
      description: string | null
      is_billable: boolean
    }) => {
      const { error } = await supabase.from('time_entries').insert({ ...entry, source: 'manual' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      TIME_DEPENDENT_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: key }))
      qc.invalidateQueries({ queryKey: ['task-hours'] })
    },
  })
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('time_entries').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      TIME_DEPENDENT_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: key }))
      qc.invalidateQueries({ queryKey: ['task-hours'] })
    },
  })
}

// -------------------------------------------------------------- share links

export function useShareLinks() {
  return useQuery({
    queryKey: ['share-links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_share_links')
        .select('*')
        .is('revoked_at', null)
      return unwrap<ShareLink[]>(data, error)
    },
  })
}

export function useCreateShareLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.rpc('create_account_share_link', {
        p_account_id: accountId,
        p_days: 90,
      })
      if (error) throw new Error(error.message)
      return data as ShareLink
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['share-links'] }),
  })
}
