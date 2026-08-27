// Domain types mirroring the Supabase schema.
// Regenerate the full typed Database with `supabase gen types typescript`
// if you want end-to-end inference; these hand-written shapes keep the app
// readable and cover everything the UI touches.

export type UserRole = 'admin' | 'executive' | 'dept_lead' | 'billing_finance' | 'hr_manager' | 'staff'
export type EmploymentType = 'employee' | 'contractor'
export type TaskTimeRequestStatus = 'pending' | 'approved' | 'denied'
export type PayPeriodStatus = 'open' | 'locked' | 'paid'
export type AccountStatus = 'active' | 'prospect' | 'paused' | 'closed'
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived'
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'in_review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TimeSource = 'timer' | 'manual'
export type DeliverableStage =
  | 'draft'
  | 'internal_review'
  | 'client_review'
  | 'approved'
  | 'revisions_requested'
export type ReviewDecision = 'submit' | 'approve' | 'request_changes' | 'reopen'
export type MonthlyBudgetStatus = 'draft' | 'approved'
export type NotificationType =
  | 'task_assigned'
  | 'deliverable_review'
  | 'deliverable_approved'
  | 'budget_threshold'
  | 'timer_running'
  | 'time_extension_requested'
  | 'time_extension_decided'
  | 'department_task_assigned'

/** A company-wide team (Studio, Tech/Tools, PPC, ...). Doubles as the org
 *  chart grouping for employees (Profile.department_id), the team a task
 *  can be routed to (Task.department_id), and — product-facing — a
 *  project's "workstream": the same `departments` table/column, just
 *  called Workstream everywhere a project's budget is being split across
 *  teams. `dept_lead` is a workstream's leader in that context. */
export interface Department {
  id: string
  org_id: string
  name: string
  color: string
}

export interface Profile {
  id: string
  org_id: string
  department_id: string | null
  full_name: string
  email: string
  role: UserRole
  /** Descriptive only — grants no different permissions than the same `role`
   *  value would otherwise have. */
  employment_type: EmploymentType
  title: string | null
  capacity_hours_per_week: number
  avatar_url: string | null
  is_active: boolean
  termination_date: string | null
  termination_reason: string | null
  last_day_worked: string | null
  rehire_eligible: boolean | null
}

export interface ProfileRate {
  profile_id: string
  org_id: string
  /** Charged to the client — drives project margin/budget. Finance-owned. */
  bill_rate: number
  /** What the person costs the company — HR-owned, tied to pay. */
  cost_rate: number
  updated_at: string
}

export interface Account {
  id: string
  org_id: string
  name: string
  code: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
  status: AccountStatus
  owner_id: string | null
}

export interface Project {
  id: string
  org_id: string
  account_id: string
  name: string
  code: string | null
  description: string | null
  status: ProjectStatus
  start_date: string | null
  /** How many months this project runs — replaces a fixed due date. The
   *  monthly budget split (project_monthly_budgets) has exactly this many
   *  rows, one per month starting at start_date (or the project's creation
   *  month if start_date is unset). */
  length_months: number
  budget_amount: number
  default_billable: boolean
}

/** One month of a project's overall budget_amount. All of a project's rows
 *  must sum to budget_amount exactly — enforced by set_project_monthly_budgets(),
 *  never by a direct table write. Once 'approved' by the MD (admin/executive),
 *  a month is locked; unapprove_project_monthly_budget() reopens it. */
export interface ProjectMonthlyBudget {
  id: string
  org_id: string
  project_id: string
  month: string
  amount: number
  status: MonthlyBudgetStatus
  approved_by: string | null
  approved_at: string | null
}

/** v_project_monthly_budget: a monthly budget row plus how much of it the MD
 *  has already allocated to workstreams. */
export interface ProjectMonthlyBudgetRow extends ProjectMonthlyBudget {
  allocated_to_workstreams: number
  unallocated_amount: number
}

/** The MD's allocation of one approved (or draft) month's budget to one
 *  workstream (department). Written only via set_workstream_budgets() or
 *  decide_workstream_budget_request() — never a direct table write. */
export interface WorkstreamBudget {
  id: string
  org_id: string
  project_id: string
  month: string
  department_id: string
  amount: number
  created_by: string | null
}

/** v_workstream_budget: a workstream's monthly allocation plus what's
 *  already committed against it via task_hour_allocations (hours × bill_rate). */
export interface WorkstreamBudgetRow {
  id: string
  org_id: string
  project_id: string
  month: string
  department_id: string
  department_name: string
  allocated_amount: number
  committed_amount: number
  remaining_amount: number
}

/** A workstream leader asking the MD for more room after planned hours
 *  would otherwise overrun the month's allocation. Mirrors TaskTimeRequest's
 *  request/decide shape. Approving adds requested_amount onto the
 *  workstream_budgets row for that project/month/department. */
export interface WorkstreamBudgetRequest {
  id: string
  org_id: string
  project_id: string
  month: string
  department_id: string
  requested_by: string
  requested_amount: number
  reason: string | null
  status: TaskTimeRequestStatus
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

/** Hours a workstream leader has committed to one contractor on one task,
 *  for one budget month. Separate from TaskAssignee (pure "who's on this
 *  task" membership) so a still-open task can carry remaining hours into
 *  the next month as a new row, without touching who's assigned. Cost
 *  against the workstream's budget = hours × that contractor's bill_rate. */
export interface TaskHourAllocation {
  id: string
  org_id: string
  task_id: string
  profile_id: string
  department_id: string
  budget_month: string
  hours: number
  created_by: string | null
}

export interface Task {
  id: string
  org_id: string
  project_id: string
  parent_task_id: string | null
  /** Routes the task to a department (which can differ from the project's
   *  own department) rather than a specific person. Setting this notifies
   *  the department's dept_lead(s), who then pick a teammate to actually
   *  assign it to (via task_assignees). Also the workstream a task's hour
   *  allocations draw budget from. */
  department_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  /** Legacy single-assignee column — superseded by task_assignees. Nothing
   *  in the app writes to it any more; kept only for old rows/back-compat. */
  assignee_id: string | null
  due_date: string | null
  estimated_hours: number | null
  position: number
  created_by: string | null
  completed_at: string | null
  created_at: string
}

/** One row of the task_assignees join table — a task can have many. */
export interface TaskAssignee {
  task_id: string
  profile_id: string
  org_id: string
  added_by: string | null
  added_at: string
}

export interface TimeEntry {
  id: string
  org_id: string
  project_id: string
  task_id: string | null
  user_id: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  description: string | null
  is_billable: boolean
  source: TimeSource
}

export interface Deliverable {
  id: string
  org_id: string
  project_id: string
  task_id: string | null
  title: string
  description: string | null
  stage: DeliverableStage
  owner_id: string | null
  reviewer_id: string | null
  due_date: string | null
  version: number
  approved_at: string | null
  created_at: string
}

/** One file or link attached to a deliverable - a deliverable can have any
 *  number of these (replaced the old single deliverables.file_path). */
export interface DeliverableAttachment {
  id: string
  org_id: string
  deliverable_id: string
  added_by: string
  kind: 'file' | 'link'
  file_path: string | null
  url: string | null
  label: string
  file_size: number | null
  content_type: string | null
  created_at: string
}

export interface DeliverableReview {
  id: string
  deliverable_id: string
  actor_id: string | null
  actor_label: string
  from_stage: DeliverableStage | null
  to_stage: DeliverableStage
  decision: ReviewDecision
  comment: string | null
  created_at: string
}

/** Open-ended discussion on a deliverable — distinct from the required
 *  comment captured on DeliverableReview at each stage transition. */
export interface DeliverableComment {
  id: string
  org_id: string
  deliverable_id: string
  author_id: string
  body: string
  created_at: string
}

export interface EmployeeAttachment {
  id: string
  org_id: string
  employee_id: string
  uploaded_by: string
  file_path: string
  file_name: string
  file_size: number | null
  content_type: string | null
  created_at: string
}

export interface AppNotification {
  id: string
  org_id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

export interface ShareLink {
  id: string
  account_id: string
  token: string
  label: string | null
  expires_at: string | null
  revoked_at: string | null
  last_viewed_at: string | null
  created_at: string
}

/**
 * v_project_budget. The money columns come back `null` for staff — RLS on
 * `time_entry_costs` filters them out rather than the UI hiding them.
 */
export interface ProjectBudget {
  project_id: string
  org_id: string
  account_id: string
  account_name: string
  name: string
  code: string | null
  status: ProjectStatus
  start_date: string | null
  length_months: number
  /** Computed from start_date + length_months — display only, not editable. */
  target_end_date: string | null
  budget_amount: number
  total_hours: number
  billable_hours: number
  accrued_amount: number | null
  accrued_cost: number | null
  pct_amount: number | null
  remaining_amount: number | null
  margin_pct: number | null
  projected_amount: number | null
}

export interface UserUtilization {
  user_id: string
  org_id: string
  full_name: string
  department_id: string | null
  capacity_hours_per_week: number
  week_start: string
  hours: number
  billable_hours: number
  utilization_pct: number | null
}

export interface DepartmentLoad {
  department_id: string
  org_id: string
  name: string
  color: string
  active_projects: number
  open_tasks: number
  overdue_tasks: number
  hours_this_week: number
  deliverables_in_review: number
}

/** Payload returned by the anonymous `get_account_portal` RPC. */
export interface PortalPayload {
  account: { name: string; contact_name: string | null; status: AccountStatus }
  projects: {
    id: string
    name: string
    status: ProjectStatus
    consumed_pct: number | null
    open_tasks: number
  }[]
  awaiting_approval: {
    id: string
    title: string
    description: string | null
    project_name: string
    due_date: string | null
    version: number
  }[]
  recently_approved: {
    title: string
    project_name: string
    approved_at: string | null
  }[]
}

/** A request to add hours to a task's estimate. Every status change goes
 *  through the decide_time_extension() RPC — there is no client UPDATE path. */
export interface TaskTimeRequest {
  id: string
  org_id: string
  task_id: string
  requested_by: string
  requested_hours: number
  reason: string | null
  status: TaskTimeRequestStatus
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

export interface PayPeriod {
  id: string
  org_id: string
  period_start: string
  period_end: string
  status: PayPeriodStatus
  locked_at: string | null
  paid_at: string | null
  paid_by: string | null
  notes: string | null
  created_at: string
}

/** One employee's payout for one pay period. Bookkeeping only for now —
 *  the actual money movement happens outside the app (Deel), see
 *  usePayEmployee(). */
export interface PayrollPayment {
  id: string
  org_id: string
  pay_period_id: string
  profile_id: string
  amount: number
  paid_at: string
  paid_by: string | null
  notes: string | null
  deel_reference: string | null
  created_at: string
}

/** A payroll_payments row with the employee name and period dates embedded,
 *  as returned by usePayrollPayments() for the Records page. */
export interface PayrollPaymentRow extends PayrollPayment {
  profile: { full_name: string } | null
  pay_period: { period_start: string; period_end: string } | null
}

/** One raw billable line for a pay period: one employee on one project.
 *  The Payment page groups these by employee and by project client-side. */
export interface PayrollEntry {
  profile_id: string
  profile_name: string
  project_id: string
  project_name: string
  hours: number
  amount: number
}

/** A grouped row (by employee, or by project) with summed hours/amount. */
export interface PayrollLineItem {
  id: string
  name: string
  hours: number
  amount: number
}
