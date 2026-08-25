import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/contexts/ToastContext'
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
  PayrollEntry,
  PayrollLineItem,
  PayrollPayment,
  PayrollPaymentRow,
  Profile,
  ProfileRate,
  Project,
  ProjectBudget,
  ShareLink,
  Task,
  TaskAssignee,
  TaskTimeRequest,
  TimeEntry,
  UserRole,
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
        >
      >
    }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', id)
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
        .upsert({ profile_id: profileId, org_id: orgId, cost_rate: costRate }, { onConflict: 'profile_id' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-rates'] }),
    onError: (err: Error) => toast.error("Couldn't save rate", err.message),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      toast.success('Invite sent', "They'll get an email to set up access.")
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
      toast.success('Department created')
    },
    onError: (err: Error) => toast.error("Couldn't create department", err.message),
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
        .select('billable_amount, user_id, profiles(full_name), project:projects(id, name), time_entries(duration_minutes)')
        .gte('entry_date', periodStart as string)
        .lte('entry_date', periodEnd as string)
      if (error) throw new Error(error.message)

      const rows: PayrollEntry[] = []
      for (const row of data ?? []) {
        const project = row.project as unknown as { id: string; name: string } | null
        const profile = row.profiles as unknown as { full_name: string } | null
        if (!project) continue
        const minutes = (row.time_entries as unknown as { duration_minutes: number | null } | null)?.duration_minutes ?? 0
        rows.push({
          profile_id: row.user_id,
          profile_name: profile?.full_name ?? 'Unknown',
          project_id: project.id,
          project_name: project.name,
          hours: minutes / 60,
          amount: Number(row.billable_amount ?? 0),
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
        .select('*, profile:profiles!payroll_payments_profile_id_fkey(full_name), pay_period:pay_periods(period_start, period_end)')
        .order('paid_at', { ascending: false })
      return unwrap<PayrollPaymentRow[]>(data, error)
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
