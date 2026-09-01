import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { supabase } from './supabaseClient'
import type {
  Account,
  AccountStatus,
  Deliverable,
  DeliverableAttachment,
  DeliverableComment,
  DeliverableReview,
  DeliverableStage,
  Department,
  DepartmentLead,
  DepartmentLoad,
  EmployeeAttachment,
  PayPeriod,
  PayrollEntry,
  PayrollLineItem,
  PayrollPayment,
  PayrollPaymentRow,
  Profile,
  ProfileRate,
  Project,
  ProjectBudget,
  ProjectMonthlyBudgetRow,
  ShareLink,
  Task,
  TaskAssignee,
  TaskHourAllocation,
  TaskTimeRequest,
  TimeEntry,
  TimesheetDecision,
  TimesheetWeekReview,
  TimesheetWeekRow,
  UserRole,
  Organization,
  OrgEmailDomain,
  PayPeriodCadence,
  UserUtilization,
  WorkspaceMembership,
  WorkstreamBudgetRequest,
  WorkstreamBudgetRow,
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
  const toast = useToast()
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
          | 'termination_date'
          | 'termination_reason'
          | 'last_day_worked'
          | 'rehire_eligible'
          | 'avatar_url'
        >
      >
    }) => {
      // `id` here is the person (auth.users.id). RLS scopes profiles to the
      // active workspace, so this hits exactly their membership in it.
      const { error } = await supabase.from('profiles').update(patch).eq('user_id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
    onError: (err: Error) => toast.error("Couldn't save", err.message),
  })
}

/** One row per profile, created lazily — most people don't have one until a
 *  rate is first set, so a missing row means "no rate on file", not zero. */
export function useProfileRates() {
  return useQuery({
    queryKey: ['profile-rates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profile_rates').select('*')
      return unwrap<ProfileRate[]>(data, error)
    },
  })
}

/**
 * HR-facing: sets only cost_rate (what the person is paid), never bill_rate
 * (what the client is charged) - that stays a finance-only concern. Upserts
 * since most profiles don't have a profile_rates row until their first rate.
 */
export function useUpdateCostRate() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ profileId, orgId, costRate }: { profileId: string; orgId: string; costRate: number }) => {
      const { error } = await supabase
        .from('profile_rates')
        .upsert({ profile_id: profileId, org_id: orgId, cost_rate: costRate }, { onConflict: 'profile_id,org_id' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-rates'] }),
    onError: (err: Error) => toast.error("Couldn't save rate", err.message),
  })
}

type InviteEmployeeResult = { id: string; claimed?: boolean }

/**
 * supabase-js throws away Edge Function error bodies: `error.message` for any
 * non-2xx is the useless string "Edge Function returned a non-2xx status code",
 * which is what admins actually saw when an invite failed. The real reason is
 * in the JSON body on `error.context` (a Response), so read it back out.
 */
async function edgeFunctionError(error: Error): Promise<string> {
  const res = (error as { context?: Response }).context
  if (res && typeof res.json === 'function') {
    try {
      const body = await res.clone().json()
      if (body?.error) return String(body.error)
    } catch {
      // Non-JSON body (a gateway error page, say) — fall through.
    }
  }
  return error.message
}

/**
 * Creating an employee needs a real auth.users row, which the anon key can't
 * create — routed through the invite-employee Edge Function, which uses the
 * service role to send the invite. The profiles row is built automatically
 * by the ensure_profile_for_auth_user() trigger from the metadata passed here.
 *
 * If the person already has an auth account (they signed in with Google on the
 * work domain before anyone invited them) the function adopts that account and
 * creates their roster row directly instead of sending an invite — it comes
 * back as `claimed: true`, and they're added straight away with no email.
 */
export function useInviteEmployee() {
  const qc = useQueryClient()
  const toast = useToast()
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
      const { data, error } = await supabase.functions.invoke<InviteEmployeeResult>(
        'invite-employee',
        { body: { ...payload, redirect_to: window.location.origin } },
      )
      if (error) throw new Error(await edgeFunctionError(error))
      return data as InviteEmployeeResult
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      if (result?.claimed) {
        toast.success('Added to the roster', 'They already had an account, so no invite was needed.')
      } else {
        toast.success('Invite sent', "They'll get an email to set up access.")
      }
    },
    onError: (err: Error) => toast.error("Couldn't send invite", err.message),
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
  const toast = useToast()
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Account created')
    },
    onError: (err: Error) => toast.error("Couldn't create account", err.message),
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Omit<Account, 'id' | 'org_id'>> }) => {
      const { error } = await supabase.from('accounts').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
    onError: (err: Error) => toast.error("Couldn't save account", err.message),
  })
}

/**
 * "Deleting" an account is a soft delete: close the account and archive its
 * projects rather than erasing the rows, so logged hours, invoices, and
 * payment history stay intact for reporting. Reversible by editing statuses
 * back.
 */
export function useArchiveAccount() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error: projectsError } = await supabase
        .from('projects')
        .update({ status: 'archived' })
        .eq('account_id', id)
      if (projectsError) throw new Error(projectsError.message)

      const { error } = await supabase.from('accounts').update({ status: 'closed' }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['budgets'] })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
      toast.success('Account archived')
    },
    onError: (err: Error) => toast.error("Couldn't archive account", err.message),
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

// ------------------------------------------------------- monthly budgets

/** v_project_monthly_budget: every month of a project's split, plus how
 *  much of each month is already allocated to workstreams. */
export function useProjectMonthlyBudgets(projectId: string | undefined) {
  return useQuery({
    queryKey: ['monthly-budgets', projectId ?? 'none'],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_project_monthly_budget')
        .select('*')
        .eq('project_id', projectId!)
        .order('month')
      return unwrap<ProjectMonthlyBudgetRow[]>(data, error)
    },
  })
}

/** Replaces the full draft monthly split for a project. Approved months are
 *  locked server-side (unapprove first); the whole set must sum to the
 *  project's budget_amount, or the RPC rejects it. */
export function useSetProjectMonthlyBudgets() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: { projectId: string; entries: { month: string; amount: number }[] }) => {
      const { error } = await supabase.rpc('set_project_monthly_budgets', {
        p_project_id: args.projectId,
        p_entries: args.entries,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['monthly-budgets', vars.projectId] })
      toast.success('Monthly budget saved')
    },
    onError: (err: Error) => toast.error("Couldn't save monthly budget", err.message),
  })
}

export function useApproveMonthlyBudget() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: { id: string; projectId: string }) => {
      const { error } = await supabase.rpc('approve_project_monthly_budget', { p_id: args.id })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['monthly-budgets', vars.projectId] })
      toast.success('Month approved')
    },
    onError: (err: Error) => toast.error("Couldn't approve", err.message),
  })
}

export function useUnapproveMonthlyBudget() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: { id: string; projectId: string }) => {
      const { error } = await supabase.rpc('unapprove_project_monthly_budget', { p_id: args.id })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['monthly-budgets', vars.projectId] })
      qc.invalidateQueries({ queryKey: ['workstream-budgets', vars.projectId] })
    },
    onError: (err: Error) => toast.error("Couldn't reopen month", err.message),
  })
}

// ---------------------------------------------------------- workstream budgets

/** v_workstream_budget: one project's workstream allocations for a given
 *  month (or every month, if no month is passed), with committed/remaining
 *  computed from task_hour_allocations. */
export function useWorkstreamBudgets(projectId: string | undefined, month?: string) {
  return useQuery({
    queryKey: ['workstream-budgets', projectId ?? 'none', month ?? 'all'],
    enabled: !!projectId,
    queryFn: async () => {
      let q = supabase.from('v_workstream_budget').select('*').eq('project_id', projectId!)
      if (month) q = q.eq('month', month)
      const { data, error } = await q.order('month')
      return unwrap<WorkstreamBudgetRow[]>(data, error)
    },
  })
}

/** Replaces a month's full workstream split in one shot. The RPC rejects it
 *  if the total exceeds that month's budget. */
export function useSetWorkstreamBudgets() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: {
      projectId: string
      month: string
      entries: { department_id: string; amount: number }[]
    }) => {
      const { error } = await supabase.rpc('set_workstream_budgets', {
        p_project_id: args.projectId,
        p_month: args.month,
        p_entries: args.entries,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['workstream-budgets', vars.projectId] })
      toast.success('Workstream budgets saved')
    },
    onError: (err: Error) => toast.error("Couldn't save workstream budgets", err.message),
  })
}

export function useWorkstreamBudgetRequests(projectId?: string) {
  return useQuery({
    queryKey: ['workstream-budget-requests', projectId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('workstream_budget_requests').select('*').order('created_at', { ascending: false })
      if (projectId) q = q.eq('project_id', projectId)
      const { data, error } = await q
      return unwrap<WorkstreamBudgetRequest[]>(data, error)
    },
  })
}

/** A workstream leader (or the MD) asking for more room in a month where
 *  planned hours would otherwise overrun the workstream's budget. */
export function useRequestWorkstreamBudget() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: {
      projectId: string
      month: string
      departmentId: string
      amount: number
      reason?: string
    }) => {
      const { error } = await supabase.rpc('request_workstream_budget', {
        p_project_id: args.projectId,
        p_month: args.month,
        p_department_id: args.departmentId,
        p_requested_amount: args.amount,
        p_reason: args.reason ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workstream-budget-requests'] })
      toast.success('Budget request sent to the MD')
    },
    onError: (err: Error) => toast.error("Couldn't send request", err.message),
  })
}

export function useDecideWorkstreamBudgetRequest() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: { requestId: string; decision: 'approve' | 'deny'; comment?: string }) => {
      const { error } = await supabase.rpc('decide_workstream_budget_request', {
        p_request_id: args.requestId,
        p_decision: args.decision,
        p_comment: args.comment ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['workstream-budget-requests'] })
      qc.invalidateQueries({ queryKey: ['workstream-budgets'] })
      toast.success(vars.decision === 'approve' ? 'Request approved' : 'Request denied')
    },
    onError: (err: Error) => toast.error("Couldn't record decision", err.message),
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
  const toast = useToast()
  return useMutation({
    mutationFn: async (project: {
      org_id: string
      account_id: string
      name: string
      code: string | null
      description: string | null
      status: Project['status']
      start_date: string | null
      /** Null = open-ended. Rejected by the DB unless the account is internal. */
      length_months: number | null
      /** Null = untracked. Rejected by the DB unless the account is internal. */
      budget_amount: number | null
      default_billable: boolean
    }) => {
      const { data, error } = await supabase.from('projects').insert(project).select('id').single()
      if (error) throw new Error(error.message)
      return data as { id: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
      qc.invalidateQueries({ queryKey: ['monthly-budgets'] })
      toast.success('Project created')
    },
    onError: (err: Error) => toast.error("Couldn't create project", err.message),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  const toast = useToast()
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
    onError: (err: Error) => toast.error("Couldn't save project", err.message),
  })
}

export function useCreateDepartment() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (dept: { org_id: string; name: string }) => {
      const { error } = await supabase.from('departments').insert(dept)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] })
      toast.success('Workstream created')
    },
    onError: (err: Error) => toast.error("Couldn't create workstream", err.message),
  })
}

/** Every "additional lead" tag across the org, in one query - lets a single
 *  admin/executive be recorded as leading any number of workstreams (see
 *  [[DepartmentLead]]), on top of whoever's a department_id member with
 *  role='dept_lead'. Used by AdminDepartments (to show/edit) and MyWork (so
 *  a multi-workstream lead's "staff this" queue covers all of them). */
export function useDepartmentLeads() {
  return useQuery({
    queryKey: ['department-leads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('department_leads').select('*')
      return unwrap<DepartmentLead[]>(data, error)
    },
    staleTime: 60_000,
  })
}

export function useAddDepartmentLead() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (row: { org_id: string; department_id: string; profile_id: string }) => {
      const { error } = await supabase.from('department_leads').insert(row)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['department-leads'] }),
    onError: (err: Error) => toast.error("Couldn't add lead", err.message),
  })
}

export function useRemoveDepartmentLead() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ departmentId, profileId }: { departmentId: string; profileId: string }) => {
      const { error } = await supabase
        .from('department_leads')
        .delete()
        .eq('department_id', departmentId)
        .eq('profile_id', profileId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['department-leads'] }),
    onError: (err: Error) => toast.error("Couldn't remove lead", err.message),
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
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { error } = await supabase.from('tasks').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
    },
    onError: (err: Error) => toast.error("Couldn't save task", err.message),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({
      assignee_ids,
      ...task
    }: Partial<Task> & {
      project_id: string
      title: string
      org_id: string
      created_by: string
      assignee_ids?: string[]
    }) => {
      const { data, error } = await supabase.from('tasks').insert(task).select('id').single()
      if (error) throw new Error(error.message)
      if (assignee_ids?.length) {
        const rows = assignee_ids.map((profile_id) => ({
          task_id: data.id as string,
          profile_id,
          org_id: task.org_id,
          added_by: task.created_by,
        }))
        const { error: aError } = await supabase.from('task_assignees').insert(rows)
        if (aError) throw new Error(aError.message)
      }
      return data.id as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['task-assignees'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
      toast.success('Task created')
    },
    onError: (err: Error) => toast.error("Couldn't create task", err.message),
  })
}

// ------------------------------------------------------------ task assignees

export function useTaskAssignees() {
  return useQuery({
    queryKey: ['task-assignees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_assignees').select('*')
      return unwrap<TaskAssignee[]>(data, error)
    },
  })
}

/** Replaces the full assignee set for one task (delete-then-insert, so it
 *  also covers clearing every assignee). */
export function useSetTaskAssignees() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: {
      task_id: string
      profile_ids: string[]
      org_id: string
      added_by: string
    }) => {
      const { error: dError } = await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', args.task_id)
      if (dError) throw new Error(dError.message)
      if (args.profile_ids.length) {
        const rows = args.profile_ids.map((profile_id) => ({
          task_id: args.task_id,
          profile_id,
          org_id: args.org_id,
          added_by: args.added_by,
        }))
        const { error: iError } = await supabase.from('task_assignees').insert(rows)
        if (iError) throw new Error(iError.message)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-assignees'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
    },
    onError: (err: Error) => toast.error("Couldn't update assignees", err.message),
  })
}

// ------------------------------------------------------ task hour allocations

/** Planned hours committed to contractors on tasks, by budget month. Powers
 *  both the task drawer's hour-assignment UI and the workstream budget's
 *  "committed" figure (hours × cost_rate — pay rate, not the client bill
 *  rate — computed in v_workstream_budget). */
export function useTaskHourAllocations(taskId?: string) {
  return useQuery({
    queryKey: ['task-hour-allocations', taskId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('task_hour_allocations').select('*').order('budget_month')
      if (taskId) q = q.eq('task_id', taskId)
      const { data, error } = await q
      return unwrap<TaskHourAllocation[]>(data, error)
    },
  })
}

/** Upserts one contractor's hours on a task for a budget month (unique on
 *  task_id/profile_id/budget_month). */
export function useSetTaskHourAllocation() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: {
      task_id: string
      profile_id: string
      department_id: string
      budget_month: string
      hours: number
      org_id: string
      created_by: string
    }) => {
      const { error } = await supabase
        .from('task_hour_allocations')
        .upsert(
          {
            task_id: args.task_id,
            profile_id: args.profile_id,
            department_id: args.department_id,
            budget_month: args.budget_month,
            hours: args.hours,
            org_id: args.org_id,
            created_by: args.created_by,
          },
          { onConflict: 'task_id,profile_id,budget_month' },
        )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-hour-allocations'] })
      qc.invalidateQueries({ queryKey: ['workstream-budgets'] })
    },
    onError: (err: Error) => toast.error("Couldn't save hours", err.message),
  })
}

export function useDeleteTaskHourAllocation() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_hour_allocations').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-hour-allocations'] })
      qc.invalidateQueries({ queryKey: ['workstream-budgets'] })
    },
    onError: (err: Error) => toast.error("Couldn't remove hours", err.message),
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
 * read policy's logic (own requests aside): any dept_lead/admin/executive,
 * org-wide. Powers the "waiting on you" card on My Work; RLS is still the
 * real enforcement if this over- or under-fetches.
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
  const toast = useToast()
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-time-requests'] })
      toast.success('Time request sent')
    },
    onError: (err: Error) => toast.error("Couldn't send request", err.message),
  })
}

/**
 * Approve or deny. Goes through the RPC, never a direct update — the table
 * grants no client UPDATE at all, so this is the only way a request's status
 * can change (approving also bumps the task's estimated_hours atomically).
 */
export function useDecideTimeExtension() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: { requestId: string; decision: 'approve' | 'deny'; comment?: string }) => {
      const { error } = await supabase.rpc('decide_time_extension', {
        p_request_id: args.requestId,
        p_decision: args.decision,
        p_comment: args.comment ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['task-time-requests'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
      toast.success(vars.decision === 'approve' ? 'Request approved' : 'Request denied')
    },
    onError: (err: Error) => toast.error("Couldn't record decision", err.message),
  })
}

// ------------------------------------------------------------------ payroll

/** Idempotently creates any missing biweekly periods (1st-15th, 16th-end of
 *  month) for a year back and two months ahead. Cheap to call on every
 *  Payroll page load — the unique constraint makes repeats a no-op. */
export function useEnsurePayPeriods() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['pay-periods', 'ensure'],
    queryFn: async () => {
      const { error } = await supabase.rpc('ensure_pay_periods')
      if (error) throw new Error(error.message)
      qc.invalidateQueries({ queryKey: ['pay-periods'] })
      return true
    },
    staleTime: 5 * 60_000,
  })
}

/** The earliest and latest entry_date across all logged time, org-wide.
 *  Used to trim the pay-period dropdown down to periods that could actually
 *  have hours in them, instead of the whole rolling generation window. */
export function useTimeEntryDateRange() {
  return useQuery({
    queryKey: ['time-entry-costs', 'date-range'],
    queryFn: async () => {
      const [oldest, newest] = await Promise.all([
        supabase.from('time_entry_costs').select('entry_date').order('entry_date', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('time_entry_costs').select('entry_date').order('entry_date', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (oldest.error) throw new Error(oldest.error.message)
      if (newest.error) throw new Error(newest.error.message)
      return { min: oldest.data?.entry_date ?? null, max: newest.data?.entry_date ?? null }
    },
    staleTime: 5 * 60_000,
  })
}

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

/** Pay periods trimmed to the span that actually has logged time — from the
 *  oldest period touching the first entry to the newest period touching the
 *  most recent one — instead of the whole rolling window ensure_pay_periods()
 *  keeps generated in the background. Shared by the Payment and Records tabs
 *  so their "time period" dropdowns stay in sync. */
export function useActivePayPeriods() {
  const { data: allPeriods = [], isLoading: periodsLoading } = usePayPeriods()
  const { data: entryRange, isLoading: rangeLoading } = useTimeEntryDateRange()
  const periods = useMemo(() => {
    if (!entryRange?.min || !entryRange?.max) return allPeriods
    return allPeriods.filter((p) => p.period_end >= entryRange.min! && p.period_start <= entryRange.max!)
  }, [allPeriods, entryRange])
  return { periods, isLoading: periodsLoading || rangeLoading }
}

/** Every billable line (one employee x one project) within a pay period.
 *  The Payment page groups these by employee and by project client-side,
 *  and filters them further to drive the employee/project drill-down modals —
 *  one fetch covers all three views instead of a query per grouping. */
export function usePayrollEntries(periodStart?: string, periodEnd?: string) {
  return useQuery({
    queryKey: ['payroll-entries', periodStart, periodEnd],
    enabled: !!periodStart && !!periodEnd,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entry_costs')
        // cost_amount (hours x the person's pay rate) is what payroll owes them --
        // billable_amount (hours x the client's bill rate) is a different number
        // entirely, for invoicing the client, and is 0 for anyone not billed out
        // (e.g. most contractors), which used to show as a misleading $0 owed here.
        .select('cost_amount, user_id, project:projects(id, name), time_entries(duration_minutes)')
        .gte('entry_date', periodStart as string)
        .lte('entry_date', periodEnd as string)
      if (error) throw new Error(error.message)

      // Names are looked up separately rather than embedded: actor columns now
      // reference app_users, so PostgREST has no profiles relationship to walk.
      const { data: people, error: peopleError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
      if (peopleError) throw new Error(peopleError.message)
      const nameByUser = new Map((people ?? []).map((p) => [p.user_id as string, p.full_name as string]))

      const rows: PayrollEntry[] = []
      for (const row of data ?? []) {
        const project = row.project as unknown as { id: string; name: string } | null
        if (!project) continue
        const minutes = (row.time_entries as unknown as { duration_minutes: number | null } | null)?.duration_minutes ?? 0
        rows.push({
          profile_id: row.user_id,
          profile_name: nameByUser.get(row.user_id as string) ?? 'Unknown',
          project_id: project.id,
          project_name: project.name,
          hours: minutes / 60,
          amount: Number(row.cost_amount ?? 0),
        })
      }
      return rows
    },
  })
}

/** Groups a set of PayrollEntry rows by a key, summing hours and amount. */
export function groupPayrollEntries<K extends 'profile' | 'project'>(
  entries: PayrollEntry[],
  key: K,
): PayrollLineItem[] {
  const map = new Map<string, PayrollLineItem>()
  for (const e of entries) {
    const id = key === 'profile' ? e.profile_id : e.project_id
    const name = key === 'profile' ? e.profile_name : e.project_name
    const existing = map.get(id)
    if (existing) {
      existing.hours += e.hours
      existing.amount += e.amount
    } else {
      map.set(id, { id, name, hours: e.hours, amount: e.amount })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount)
}

/** Every payment recorded for one pay period, keyed by profile_id so the
 *  Payment page can badge already-paid employees without a query per row. */
export function usePayrollPaymentsForPeriod(periodId?: string) {
  return useQuery({
    queryKey: ['payroll-payments', 'period', periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_payments')
        .select('*')
        .eq('pay_period_id', periodId as string)
      return unwrap<PayrollPayment[]>(data, error)
    },
  })
}

export function usePayrollPayments() {
  return useQuery({
    queryKey: ['payroll-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_payments')
        .select('*, pay_period:pay_periods(period_start, period_end)')
        .order('paid_at', { ascending: false })
      if (error) throw new Error(error.message)

      const { data: people, error: peopleError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
      if (peopleError) throw new Error(peopleError.message)
      const nameByUser = new Map((people ?? []).map((p) => [p.user_id as string, p.full_name as string]))

      return (data ?? []).map((row) => ({
        ...row,
        profile: { full_name: nameByUser.get(row.profile_id as string) ?? 'Unknown' },
      })) as PayrollPaymentRow[]
    },
  })
}

/** Bookkeeping only — records that an employee was paid. Does not move
 *  money; that still happens through Deel until the payout trigger lands. */
export function usePayEmployee() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: { periodId: string; profileId: string; amount: number }) => {
      const { error } = await supabase.rpc('record_payroll_payment', {
        p_period_id: args.periodId,
        p_profile_id: args.profileId,
        p_amount: args.amount,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-payments'] })
      toast.success('Payment recorded')
    },
    onError: (err: Error) => toast.error("Couldn't record payment", err.message),
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
const DELIVERABLE_STAGE_LABEL: Record<DeliverableStage, string> = {
  draft: 'Moved to draft',
  internal_review: 'Sent for internal review',
  client_review: 'Sent for client review',
  approved: 'Deliverable approved',
  revisions_requested: 'Revisions requested',
}

export function useTransitionDeliverable() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: { id: string; toStage: DeliverableStage; comment?: string }) => {
      const { error } = await supabase.rpc('transition_deliverable', {
        p_deliverable_id: args.id,
        p_to_stage: args.toStage,
        p_comment: args.comment ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['deliverables'] })
      qc.invalidateQueries({ queryKey: ['reviews'] })
      qc.invalidateQueries({ queryKey: ['dept-load'] })
      toast.success(DELIVERABLE_STAGE_LABEL[vars.toStage] ?? 'Deliverable updated')
    },
    onError: (err: Error) => toast.error("Couldn't update deliverable", err.message),
  })
}

export function useCreateDeliverable() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (
      d: Pick<Deliverable, 'org_id' | 'project_id' | 'title'> &
        Partial<Pick<Deliverable, 'description' | 'task_id' | 'owner_id' | 'reviewer_id' | 'due_date'>>,
    ) => {
      const { data, error } = await supabase.from('deliverables').insert(d).select('id').single()
      if (error) throw new Error(error.message)
      return data.id as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliverables'] })
      toast.success('Deliverable created')
    },
    onError: (err: Error) => toast.error("Couldn't create deliverable", err.message),
  })
}

/** Basics only — never `stage` (guarded server-side, must go through
 *  useTransitionDeliverable) or `version`/`approved_at` (server-managed). */
export function useUpdateDeliverable() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<
        Pick<Deliverable, 'title' | 'description' | 'task_id' | 'owner_id' | 'reviewer_id' | 'due_date'>
      >
    }) => {
      const { error } = await supabase.from('deliverables').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliverables'] })
      toast.success('Saved')
    },
    onError: (err: Error) => toast.error("Couldn't save", err.message),
  })
}

export function useDeleteDeliverable() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('deliverables').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliverables'] })
      toast.success('Deliverable deleted')
    },
    onError: (err: Error) => toast.error("Couldn't delete deliverable", err.message),
  })
}

// ------------------------------------------------------ deliverable comments

export function useDeliverableComments(deliverableId: string | undefined) {
  return useQuery({
    queryKey: ['deliverable-comments', deliverableId],
    enabled: !!deliverableId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliverable_comments')
        .select('*')
        .eq('deliverable_id', deliverableId!)
        .order('created_at')
      return unwrap<DeliverableComment[]>(data, error)
    },
  })
}

export function useAddDeliverableComment() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (c: Pick<DeliverableComment, 'org_id' | 'deliverable_id' | 'author_id' | 'body'>) => {
      const { error } = await supabase.from('deliverable_comments').insert(c)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['deliverable-comments', vars.deliverable_id] }),
    onError: (err: Error) => toast.error("Couldn't post comment", err.message),
  })
}

export function useDeleteDeliverableComment() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ id }: { id: string; deliverableId: string }) => {
      const { error } = await supabase.from('deliverable_comments').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['deliverable-comments', vars.deliverableId] }),
    onError: (err: Error) => toast.error("Couldn't delete comment", err.message),
  })
}

// ---------------------------------------------------- deliverable attachments

/** Every file/link on one deliverable (used by DeliverablePanel). */
export function useDeliverableAttachments(deliverableId: string | undefined) {
  return useQuery({
    queryKey: ['deliverable-attachments', deliverableId],
    enabled: !!deliverableId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliverable_attachments')
        .select('*')
        .eq('deliverable_id', deliverableId!)
        .order('created_at')
      return unwrap<DeliverableAttachment[]>(data, error)
    },
  })
}

/** Attachment counts for every deliverable in the org, in one query - used
 *  by DeliverableCard so a kanban board full of cards doesn't fire one
 *  query per card just to show a paperclip badge. */
export function useDeliverableAttachmentCounts() {
  return useQuery({
    queryKey: ['deliverable-attachment-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deliverable_attachments').select('deliverable_id')
      const rows = unwrap<{ deliverable_id: string }[]>(data, error)
      const counts: Record<string, number> = {}
      rows.forEach((r) => {
        counts[r.deliverable_id] = (counts[r.deliverable_id] ?? 0) + 1
      })
      return counts
    },
  })
}

export function useAddDeliverableAttachment() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (
      row: Pick<
        DeliverableAttachment,
        'org_id' | 'deliverable_id' | 'added_by' | 'kind' | 'file_path' | 'url' | 'label' | 'file_size' | 'content_type'
      >,
    ) => {
      const { error } = await supabase.from('deliverable_attachments').insert(row)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['deliverable-attachments', vars.deliverable_id] })
      qc.invalidateQueries({ queryKey: ['deliverable-attachment-counts'] })
    },
    onError: (err: Error) => toast.error("Couldn't add attachment", err.message),
  })
}

export function useDeleteDeliverableAttachment() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ id }: { id: string; deliverableId: string }) => {
      const { error } = await supabase.from('deliverable_attachments').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['deliverable-attachments', vars.deliverableId] })
      qc.invalidateQueries({ queryKey: ['deliverable-attachment-counts'] })
    },
    onError: (err: Error) => toast.error("Couldn't delete attachment", err.message),
  })
}

// ------------------------------------------------------ employee attachments

/** Employee document metadata (Admin > Employees > Attachments tab). File
 *  bytes live in the `employee-files` storage bucket; upload/remove of the
 *  actual object happens in the component (same convention as deliverable
 *  file attachments), these hooks just manage the row. */
export function useEmployeeAttachments(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-attachments', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_attachments')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('created_at')
      return unwrap<EmployeeAttachment[]>(data, error)
    },
  })
}

export function useAddEmployeeAttachment() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (
      row: Pick<
        EmployeeAttachment,
        'org_id' | 'employee_id' | 'uploaded_by' | 'file_path' | 'file_name' | 'file_size' | 'content_type'
      >,
    ) => {
      const { error } = await supabase.from('employee_attachments').insert(row)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['employee-attachments', vars.employee_id] }),
    onError: (err: Error) => toast.error("Couldn't save attachment", err.message),
  })
}

export function useDeleteEmployeeAttachment() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ id }: { id: string; employeeId: string }) => {
      const { error } = await supabase.from('employee_attachments').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['employee-attachments', vars.employeeId] }),
    onError: (err: Error) => toast.error("Couldn't delete attachment", err.message),
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
  const toast = useToast()
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
      toast.success('Time logged')
    },
    onError: (err: Error) => toast.error("Couldn't log time", err.message),
  })
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('time_entries').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      TIME_DEPENDENT_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: key }))
      qc.invalidateQueries({ queryKey: ['task-hours'] })
      toast.success('Entry deleted')
    },
    onError: (err: Error) => toast.error("Couldn't delete entry", err.message),
  })
}

// -------------------------------------------------------- timesheet approval

/** Anything that moves a week through the chain also changes what payroll is
 *  allowed to do, so these invalidate together. */
const TIMESHEET_KEYS = [['timesheet-weeks'], ['timesheet-week-reviews'], ['payroll-blockers']]

/** Idempotent housekeeping, same pattern as useEnsurePayPeriods: creates any
 *  missing (contractor, week, workstream) rows and auto-submits the ones whose
 *  week has finished. Cheap to call on every page that shows a queue. */
export function useEnsureTimesheetWeeks(enabled = true) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['timesheet-weeks', 'ensure'],
    enabled,
    queryFn: async () => {
      const { error } = await supabase.rpc('ensure_timesheet_weeks')
      if (error) throw new Error(error.message)
      qc.invalidateQueries({ queryKey: ['timesheet-weeks'] })
      return true
    },
    staleTime: 5 * 60_000,
  })
}

/** Timesheet weeks, newest first. RLS decides what comes back: your own weeks
 *  always, plus everyone's if you are a lead, admin, executive or finance —
 *  so the same hook backs both the person's own banner and the approval
 *  queues, filtered client-side. */
export function useTimesheetWeeks(opts: { userId?: string; status?: string[] } = {}) {
  return useQuery({
    queryKey: ['timesheet-weeks', opts.userId ?? '-', (opts.status ?? []).join(',')],
    queryFn: async () => {
      let q = supabase
        .from('v_timesheet_weeks')
        .select('*')
        .order('week_start', { ascending: false })
      if (opts.userId) q = q.eq('user_id', opts.userId)
      if (opts.status?.length) q = q.in('status', opts.status)
      const { data, error } = await q.limit(500)
      return unwrap<TimesheetWeekRow[]>(data, error)
    },
  })
}

export function useTimesheetWeekReviews(weekId?: string) {
  return useQuery({
    queryKey: ['timesheet-week-reviews', weekId],
    enabled: !!weekId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('timesheet_week_reviews')
        .select('*')
        .eq('timesheet_week_id', weekId as string)
        .order('created_at', { ascending: false })
      return unwrap<TimesheetWeekReview[]>(data, error)
    },
  })
}

const DECISION_TOAST: Record<TimesheetDecision, string> = {
  lead_approve: 'Approved — sent to the managing director',
  md_approve: 'Approved for payroll',
  reject: 'Sent back to be fixed',
  resubmit: 'Resubmitted for approval',
  reopen: 'Week reopened',
}

/** The single write path for a timesheet week. Every rule (who may act, from
 *  which state, comment required on a rejection) lives in the RPC, so a
 *  failure here is the server talking and its message is worth showing. */
export function useDecideTimesheetWeek() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: { weekId: string; decision: TimesheetDecision; comment?: string }) => {
      const { error } = await supabase.rpc('decide_timesheet_week', {
        p_week_id: args.weekId,
        p_decision: args.decision,
        p_comment: args.comment ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      TIMESHEET_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: key }))
      qc.invalidateQueries({ queryKey: ['notifications'] })
      toast.success(DECISION_TOAST[vars.decision])
    },
    onError: (err: Error) => toast.error("Couldn't record that decision", err.message),
  })
}

/** Keeps every open timesheet queue in sync across sessions: a lead
 *  confirming hours on one screen should move the row on the managing
 *  director's screen (and finance's) without anyone reloading. Mirrors the
 *  realtime pattern NotificationsProvider uses -- there's no local state to
 *  reconcile here, since everything reads through React Query, so on any
 *  change we just invalidate the cache and let each active query refetch.
 *
 *  postgres_changes filters per-subscriber by the table's own RLS SELECT
 *  policy, so a contractor's channel only ever fires for their own rows --
 *  this can't leak another person's approval status or comments to them.
 *  Mount once near the root of the authenticated app (AppShell), not per
 *  page, so opening several timesheet-related pages doesn't open several
 *  channels. */
export function useTimesheetWeeksRealtime() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const orgId = profile?.org_id ?? null

  useEffect(() => {
    if (!orgId) return

    const channel = supabase
      .channel(`timesheet-weeks:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'timesheet_weeks', filter: `org_id=eq.${orgId}` },
        () => qc.invalidateQueries({ queryKey: ['timesheet-weeks'] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'timesheet_week_reviews', filter: `org_id=eq.${orgId}` },
        () => qc.invalidateQueries({ queryKey: ['timesheet-week-reviews'] }),
      )
      .subscribe()

    return () => void supabase.removeChannel(channel)
  }, [orgId, qc])
}

/** Every entry behind one timesheet week. Two round trips rather than one:
 *  v_time_entry_weeks is a view, so PostgREST has no relationship to embed
 *  time_entries through — it hands back the ids and we fetch the rows. */
export function useTimesheetWeekEntries(week?: {
  user_id: string
  week_start: string
  department_id: string | null
}) {
  return useQuery({
    queryKey: ['timesheet-week-entries', week?.user_id, week?.week_start, week?.department_id ?? '-'],
    enabled: !!week,
    queryFn: async () => {
      const { data: keys, error: keyError } = await supabase
        .from('v_time_entry_weeks')
        .select('time_entry_id, department_id')
        .eq('user_id', week!.user_id)
        .eq('week_start', week!.week_start)
      if (keyError) throw new Error(keyError.message)

      const ids = (keys ?? [])
        .filter((k) => (k.department_id ?? null) === (week!.department_id ?? null))
        .map((k) => k.time_entry_id as string)
      if (ids.length === 0) return []

      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .in('id', ids)
        .order('started_at')
      return unwrap<TimeEntry[]>(data, error)
    },
  })
}

/** Per-person "is their time cleared for payroll?" for one pay period, keyed
 *  by user_id. Employees never appear — only contractors go through the
 *  chain — so a missing key means "nothing blocking". */
export function usePayrollApprovalBlockers(periodStart?: string, periodEnd?: string) {
  const { data: weeks = [], isLoading } = useTimesheetWeeks()
  const blockers = useMemo(() => {
    const map = new Map<string, TimesheetWeekRow[]>()
    if (!periodStart || !periodEnd) return map
    for (const w of weeks) {
      if (w.status === 'approved') continue
      // A week blocks a period only if some of its days actually fall in it.
      const start = w.week_start
      const end = new Date(new Date(`${w.week_start}T00:00:00Z`).getTime() + 6 * 86_400_000)
        .toISOString()
        .slice(0, 10)
      if (end < periodStart || start > periodEnd) continue
      map.set(w.user_id, [...(map.get(w.user_id) ?? []), w])
    }
    return map
  }, [weeks, periodStart, periodEnd])
  return { blockers, isLoading }
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
  const toast = useToast()
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.rpc('create_account_share_link', {
        p_account_id: accountId,
        p_days: 90,
      })
      if (error) throw new Error(error.message)
      return data as ShareLink
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['share-links'] })
      toast.success('Client link created')
    },
    onError: (err: Error) => toast.error("Couldn't create link", err.message),
  })
}

// ------------------------------------------------------------- workspaces

/** Every workspace the signed-in person holds an active membership in.
 *  One row today; the Phase 3 switcher renders this list. */
export function useMyWorkspaces() {
  return useQuery({
    queryKey: ['my-workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_workspaces')
      return unwrap<WorkspaceMembership[]>(data, error)
    },
    staleTime: 5 * 60_000,
  })
}

/** Switches which workspace this session is in. The RPC verifies an active
 *  membership before writing — that check is the security boundary, not this
 *  call — and every RLS policy follows because they all route through
 *  current_org_id(). Everything cached is workspace-scoped, so the whole
 *  query cache is dropped on success. */
export function useSetActiveWorkspace() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (orgId: string) => {
      const { error } = await supabase.rpc('set_active_workspace', { p_org_id: orgId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.clear(),
    onError: (err: Error) => toast.error("Couldn't switch workspace", err.message),
  })
}

// ------------------------------------------------- the workspace itself

/** The active workspace. RLS scopes `organizations` to current_org_id(), so
 *  this is always exactly one row — no filter needed. */
export function useWorkspace() {
  return useQuery({
    queryKey: ['workspace'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organizations').select('*').maybeSingle()
      if (error) throw new Error(error.message)
      return data as Organization | null
    },
    staleTime: 5 * 60_000,
  })
}

/** Owner-only — the org_update policy enforces it, this just shapes the call. */
export function useUpdateWorkspace() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Organization> }) => {
      const { error } = await supabase
        .from('organizations')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['workspace'] })
      qc.invalidateQueries({ queryKey: ['my-workspaces'] })
      // Cadence drives the pay period calendar; currency drives every figure.
      if (vars.patch.pay_period_cadence) qc.invalidateQueries({ queryKey: ['pay-periods'] })
      toast.success('Workspace updated')
    },
    onError: (err: Error) => toast.error("Couldn't save workspace settings", err.message),
  })
}

export function useOrgEmailDomains() {
  return useQuery({
    queryKey: ['org-email-domains'],
    queryFn: async () => {
      const { data, error } = await supabase.from('org_email_domains').select('*').order('domain')
      return unwrap<OrgEmailDomain[]>(data, error)
    },
  })
}

/** Hands the workspace to someone else, atomically. The RPC checks that the
 *  caller is the current owner and the target is an active member; the
 *  is_owner column can't be moved by a direct update at all. */
export function useTransferOwnership() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (toUserId: string) => {
      const { error } = await supabase.rpc('transfer_workspace_ownership', { p_to_user_id: toUserId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      qc.invalidateQueries({ queryKey: ['workspace'] })
      toast.success('Ownership transferred')
    },
    onError: (err: Error) => toast.error("Couldn't transfer ownership", err.message),
  })
}

/** Soft-deletes the caller's active workspace: is_workspace_owner() or
 *  is_platform_admin(), and the caller must already belong to another
 *  active workspace (that's the "more than one workspace" gate — it's
 *  about the acting owner never being left with nowhere to go, not a
 *  platform-wide floor). On success the RPC has already switched the
 *  caller's active workspace to that other one. */
export function useDeleteWorkspace() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_workspace')
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.clear(),
    onError: (err: Error) => toast.error("Couldn't delete workspace", err.message),
  })
}

/** Wipes all operational data in the current workspace (accounts, projects,
 *  tasks, time entries, deliverables, budgets, payroll, notifications) but
 *  keeps the workspace itself, its settings, and everyone's membership --
 *  unless `wipeEmployees` is set, which additionally removes every profile
 *  (and their pay rate, workstream-lead tags, and attachments) except the
 *  workspace owner and anyone with the Admin role. Workstreams themselves
 *  are never touched either way -- this is a people-and-data wipe, not a
 *  structure wipe. Soft: reset_workspace() archives everything first, so a
 *  mistake is recoverable via direct DB access for now (no purge job or
 *  recovery UI exists yet). Same permission tier as delete — owner or
 *  platform staff — but no "belong to another workspace" gate, since
 *  resetting doesn't strand anyone. */
export function useResetWorkspace() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (wipeEmployees: boolean) => {
      const { error } = await supabase.rpc('reset_workspace', { p_wipe_employees: wipeEmployees })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.clear(),
    onError: (err: Error) => toast.error("Couldn't reset workspace", err.message),
  })
}

/** platform_admins has RLS on and zero policies, so it can't be read from the
 *  client at all — this asks the SECURITY DEFINER helper instead. */
export function useIsPlatformAdmin() {
  return useQuery({
    queryKey: ['is-platform-admin'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_platform_admin')
      if (error) throw new Error(error.message)
      return data === true
    },
    staleTime: 30 * 60_000,
  })
}

/** Creates a workspace and everything it needs to be usable on arrival —
 *  workstreams, an internal account, a pay period calendar — in one
 *  transaction. The caller becomes its owner, and their active workspace
 *  switches to it, so the caller should reload afterwards. */
export function useCreateWorkspace() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (args: {
      name: string
      slug: string
      currency: string
      timezone: string
      cadence: PayPeriodCadence
    }) => {
      const { data, error } = await supabase.rpc('create_workspace', {
        p_name: args.name,
        p_slug: args.slug,
        p_currency: args.currency,
        p_timezone: args.timezone,
        p_cadence: args.cadence,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-workspaces'] })
      toast.success('Workspace created', 'Switching you into it now.')
    },
    onError: (err: Error) => toast.error("Couldn't create the workspace", err.message),
  })
}
