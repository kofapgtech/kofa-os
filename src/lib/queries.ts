import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import type {
  Account,
  AccountStatus,
  Deliverable,
  DeliverableReview,
  DeliverableStage,
  Department,
  DepartmentLoad,
  PayPeriod,
  Profile,
  Project,
  ProjectBudget,
  ShareLink,
  Task,
  TaskTimeRequest,
  TimeEntry,
  UserRole,
  UserUtilization,
  Workstream,
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

/** Includes deactivated people too - for admin management, where they need to stay visible to be reactivated. */
export function useAllProfiles() {
  return useQuery({
    queryKey: ['profiles', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('full_name')
      return unwrap<Profile[]>(data, error)
    },
    staleTime: 5 * 60_000,
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<
        Pick<
          Profile,
          | 'full_name'
          | 'department_id'
          | 'role'
          | 'title'
          | 'capacity_hours_per_week'
          | 'is_active'
          | 'employment_type'
        >
      >
    }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

/**
 * Creating an employee needs a real auth.users row, which the anon key can't
 * create — routed through the invite-employee Edge Function, which uses the
 * service role to send the invite. The profiles row is built automatically
 * by the existing handle_new_user() trigger from the metadata passed here.
 */
export function useInviteEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      full_name: string
      email: string
      role: UserRole
      department_id: string | null
      title: string | null
      capacity_hours_per_week: number
      employment_type: 'employee' | 'contractor'
    }) => {
      const { data, error } = await supabase.functions.invoke('invite-employee', {
        // The invite email's link needs to land back on whichever origin is
        // actually running the app - localhost while testing, the real
        // deploy in production - so the browser sends its own origin rather
        // than the function guessing from a fixed secret.
        body: { ...payload, redirect_to: window.location.origin },
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
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

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (account: {
      org_id: string
      name: string
      code: string | null
      primary_contact_name: string | null
      primary_contact_email: string | null
      status: AccountStatus
      owner_id: string | null
    }) => {
      const { error } = await supabase.from('accounts').insert(account)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Omit<Account, 'id' | 'org_id'>> }) => {
      const { error } = await supabase.from('accounts').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
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

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (project: {
      org_id: string
      account_id: string
      department_id: string | null
      name: string
      code: string | null
      description: string | null
      status: Project['status']
      start_date: string | null
      due_date: string | null
      budget_amount: number
      budget_hours: number
      default_billable: boolean
      lead_id: string | null
    }) => {
      const { data, error } = await supabase.from('projects').insert(project).select('id').single()
      if (error) throw new Error(error.message)
      return data as { id: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
    },
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Omit<Project, 'id' | 'org_id'>> }) => {
      const { error } = await supabase.from('projects').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
    },
  })
}

// ---------------------------------------------------------------- work streams

export function useWorkstreams(projectId: string | undefined) {
  return useQuery({
    queryKey: ['workstreams', projectId ?? '-'],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workstreams')
        .select('*')
        .eq('project_id', projectId!)
        .order('name')
      return unwrap<Workstream[]>(data, error)
    },
  })
}

export function useCreateWorkstream() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ws: {
      org_id: string
      project_id: string
      name: string
      description: string | null
      created_by: string
    }) => {
      const { error } = await supabase.from('workstreams').insert(ws)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['workstreams', vars.project_id] }),
  })
}

export function useWorkstreamMembers(workstreamId: string | undefined) {
  return useQuery({
    queryKey: ['workstream-members', workstreamId ?? '-'],
    enabled: !!workstreamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workstream_members')
        .select('profile_id, is_lead, added_at, profiles(id, full_name, email)')
        .eq('workstream_id', workstreamId!)
      if (error) throw new Error(error.message)
      // PostgREST embeds a to-one relation as an object, but the client's
      // type inference (no generated Database schema here) can't know that
      // cardinality from the select string alone and assumes an array.
      return (data ?? []).map((row) => {
        const embedded = row.profiles as unknown
        const p = (Array.isArray(embedded) ? embedded[0] : embedded) as Pick<
          Profile,
          'id' | 'full_name' | 'email'
        >
        return {
          profile_id: row.profile_id as string,
          is_lead: row.is_lead as boolean,
          added_at: row.added_at as string,
          profile: p,
        }
      })
    },
  })
}

/** Flips coordination authority for one member of one workstream. */
export function useSetWorkstreamLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { workstream_id: string; profile_id: string; is_lead: boolean }) => {
      const { error } = await supabase
        .from('workstream_members')
        .update({ is_lead: args.is_lead })
        .eq('workstream_id', args.workstream_id)
        .eq('profile_id', args.profile_id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['workstream-members', vars.workstream_id] }),
  })
}

export function useAddWorkstreamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { workstream_id: string; profile_id: string; added_by: string }) => {
      const { error } = await supabase.from('workstream_members').insert(args)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['workstream-members', vars.workstream_id] }),
  })
}

export function useRemoveWorkstreamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { workstream_id: string; profile_id: string }) => {
      const { error } = await supabase
        .from('workstream_members')
        .delete()
        .eq('workstream_id', args.workstream_id)
        .eq('profile_id', args.profile_id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['workstream-members', vars.workstream_id] }),
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

// ------------------------------------------------------------- time requests

/** Requests for more hours on a specific task. */
export function useTaskTimeRequests(taskId?: string) {
  return useQuery({
    queryKey: ['task-time-requests', taskId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('task_time_requests').select('*').order('created_at', { ascending: false })
      if (taskId) q = q.eq('task_id', taskId)
      const { data, error } = await q
      return unwrap<TaskTimeRequest[]>(data, error)
    },
  })
}

/**
 * Every pending request the signed-in user could act on — mirrors the RLS
 * read policy's logic (own requests aside): any lead/admin/executive, or a
 * workstream lead of the task's project. Powers the "waiting on you" card
 * on My Work; RLS is still the real enforcement if this over- or under-fetches.
 */
export function usePendingApprovals() {
  return useQuery({
    queryKey: ['task-time-requests', 'pending-approvals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_time_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at')
      return unwrap<TaskTimeRequest[]>(data, error)
    },
  })
}

export function useRequestTimeExtension() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (req: {
      org_id: string
      task_id: string
      requested_by: string
      requested_hours: number
      reason: string | null
    }) => {
      const { error } = await supabase.from('task_time_requests').insert(req)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-time-requests'] }),
  })
}

/**
 * Approve or deny. Goes through the RPC, never a direct update — the table
 * grants no client UPDATE at all, so this is the only way a request's status
 * can change (approving also bumps the task's estimated_hours atomically).
 */
export function useDecideTimeExtension() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { requestId: string; decision: 'approve' | 'deny'; comment?: string }) => {
      const { error } = await supabase.rpc('decide_time_extension', {
        p_request_id: args.requestId,
        p_decision: args.decision,
        p_comment: args.comment ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-time-requests'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
    },
  })
}

// ------------------------------------------------------------------ payroll

export function usePayPeriods() {
  return useQuery({
    queryKey: ['pay-periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pay_periods')
        .select('*')
        .order('period_start', { ascending: false })
      return unwrap<PayPeriod[]>(data, error)
    },
  })
}

/** Total billable $ accrued across the org within one period's date range. */
export function usePayPeriodTotal(periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: ['pay-periods', 'total', periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entry_costs')
        .select('billable_amount')
        .gte('entry_date', periodStart)
        .lte('entry_date', periodEnd)
      if (error) throw new Error(error.message)
      return (data ?? []).reduce((sum, row) => sum + Number(row.billable_amount ?? 0), 0)
    },
  })
}

export function useMarkPayPeriodPaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (periodId: string) => {
      const { error } = await supabase.rpc('mark_pay_period_paid', { p_period_id: periodId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pay-periods'] }),
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
