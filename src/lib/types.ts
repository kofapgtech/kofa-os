// Domain types mirroring the Supabase schema.
// Regenerate the full typed Database with `supabase gen types typescript`
// if you want end-to-end inference; these hand-written shapes keep the app
// readable and cover everything the UI touches.

export type UserRole = 'admin' | 'executive' | 'dept_lead' | 'hr_manager' | 'staff'
export type EmploymentType = 'employee' | 'contractor'
export type TaskTimeRequestStatus = 'pending' | 'approved' | 'denied'
export type PayPeriodStatus = 'open' | 'locked' | 'paid'
export type AccountStatus = 'active' | 'prospect' | 'paused' | 'closed'
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived'
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'in_review' | 'done'
/** How a task's work turns into money. 'time' is the original model —
 *  hours x cost_rate, committed via task_hour_allocations. 'deliverable' pays
 *  a flat fee per accepted deliverable via deliverable_fee_allocations, and
 *  time logged on such a task earns nothing (it is kept for utilisation only). */
export type TaskTrackingMode = 'time' | 'deliverable'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TimeSource = 'timer' | 'manual'
export type TimesheetWeekStatus =
  | 'draft'
  | 'pending_lead'
  | 'pending_md'
  | 'approved'
  | 'rejected'
export type TimesheetDecision =
  | 'lead_approve'
  | 'md_approve'
  | 'reject'
  | 'resubmit'
  | 'reopen'
export type DeliverableStage =
  | 'draft'
  | 'internal_review'
  | 'client_review'
  | 'approved'
  | 'revisions_requested'
export type ReviewDecision = 'submit' | 'approve' | 'request_changes' | 'reopen'
export type MonthlyBudgetStatus = 'draft' | 'approved'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TicketCategory =
  | 'it_support'
  | 'access'
  | 'hr'
  | 'payroll'
  | 'facilities'
  | 'other'
export type PayPeriodCadence = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly'
export type NotificationType =
  | 'task_assigned'
  | 'deliverable_review'
  | 'deliverable_approved'
  | 'budget_threshold'
  | 'timer_running'
  | 'time_extension_requested'
  | 'time_extension_decided'
  | 'department_task_assigned'
  | 'timesheet_submitted'
  | 'timesheet_decided'
  | 'ticket_submitted'
  | 'ticket_reply'
  | 'ticket_status'
  | 'ticket_assigned'

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

/** Tags a profile as an ADDITIONAL lead of a workstream, on top of (or
 *  instead of) the department_id+role='dept_lead' convention above - lets
 *  a single admin/executive lead any number of workstreams at once, since
 *  department_id can only ever point at one. See department_leads table. */
export interface DepartmentLead {
  department_id: string
  profile_id: string
  org_id: string
  created_at: string
}

/** Tags a profile as staffed on an ADDITIONAL workstream, on top of their
 *  primary department_id. Unlike DepartmentLead this is about being eligible
 *  for task/hour assignment there, not leadership - see HourAllocationsSection
 *  and the workstream_members table. */
export interface WorkstreamMember {
  department_id: string
  profile_id: string
  org_id: string
  added_by: string
  created_at: string
}

/** A person's membership of ONE workspace. Since the identity/membership split
 *  a human can hold several of these, so the row is keyed on `membership_id`
 *  and the person is `user_id` (= auth.users.id = app_users.id).
 *
 *  There is deliberately no `id` field: every actor column in the schema
 *  (assignee_id, owner_id, user_id, profile_id, created_by…) stores the
 *  *person*, so `user_id` is almost always what you want, and dropping `id`
 *  turns any stale usage into a compile error rather than a silent mismatch. */
export interface Profile {
  membership_id: string
  user_id: string
  org_id: string
  /** Owner of this workspace: settings, ownership transfer, and later billing.
   *  A flag rather than a user_role value — check it, don't infer it from role. */
  is_owner: boolean
  department_id: string | null
  full_name: string
  email: string
  role: UserRole
  /** Cuts across `role` rather than replacing it. Almost entirely descriptive
   *  — the pay chain differs, and contractors don't get the Accounts page
   *  (see AuthContext.isContractor) — but every other permission still comes
   *  from `role`. */
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

/** Keyed on (profile_id, org_id) — rates are per workspace, so the same
 *  contractor can be paid differently by two agencies on the platform. */
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
  /** The workspace's own account, for internal work rather than a client's.
   *  Exactly one per org, enforced by a partial unique index. It can't be
   *  deleted, can't be flipped after insert, and can't be issued a client
   *  portal link — and only its projects may go untracked (see Project). */
  is_internal: boolean
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
   *  month if start_date is unset). Null means open-ended — only allowed on
   *  the internal account. */
  length_months: number | null
  /** Null means no budget is tracked — only allowed on the internal account.
   *  Zero still means a tracked budget that happens to be zero, so the two
   *  are not interchangeable. */
  budget_amount: number | null
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
 *  already committed against it via task_hour_allocations (hours × cost_rate
 *  — what people are actually paid, never the client bill rate). */
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
 *  against the workstream's budget = hours × that contractor's cost_rate
 *  (pay rate, not the client bill rate). */
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
  /** Time-tracked (hours) or deliverable-tracked (flat fee per deliverable).
   *  Defaults to 'time' — every task that existed before this feature is one. */
  tracking_mode: TaskTrackingMode
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

/** One contractor x one week x one workstream — the unit the approval chain
 *  moves through. Created and auto-submitted by ensure_timesheet_weeks();
 *  every state change after that goes through decide_timesheet_week(), so
 *  there is deliberately no way to write this table from the client.
 *
 *  `department_id` is null for time logged with no task by someone with no
 *  workstream of their own — those weeks fall to the MD to approve. */
export interface TimesheetWeek {
  id: string
  org_id: string
  user_id: string
  /** Monday of the week, in UTC — the same basis as time_entry_costs.entry_date. */
  week_start: string
  department_id: string | null
  status: TimesheetWeekStatus
  submitted_at: string | null
  lead_approved_by: string | null
  lead_approved_at: string | null
  md_approved_by: string | null
  md_approved_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_comment: string | null
  /** Set once every day of the week sits inside a pay period this person has
   *  been paid for. A week straddling two periods waits for both. */
  paid_at: string | null
  created_at: string
  updated_at: string
}

/** v_timesheet_weeks — the week plus the names and totals every queue needs.
 *  cost_amount comes from time_entry_costs, which is RLS'd to people with
 *  financial access, so a contractor reading their own row sees 0 there. */
export interface TimesheetWeekRow extends TimesheetWeek {
  user_name: string | null
  department_name: string | null
  department_color: string | null
  total_minutes: number
  entry_count: number
  cost_amount: number
  lead_approved_by_name: string | null
  md_approved_by_name: string | null
  rejected_by_name: string | null
  /** Deliverable fees accepted in this week — deliberately NOT folded into
   *  cost_amount, so an approver sees hours and fees as two separate numbers. */
  fee_amount: number
  fee_count: number
}

export interface TimesheetWeekReview {
  id: string
  org_id: string
  timesheet_week_id: string
  actor_id: string | null
  decision: TimesheetDecision
  comment: string | null
  created_at: string
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
  /** The workstream lead's acceptance — the money event, deliberately separate
   *  from `stage`/`approved_at`, which track the client-facing review board.
   *  Set only by accept_deliverable(); this is what makes the deliverable's fee
   *  allocations earned and payable. */
  accepted_at: string | null
  accepted_by: string | null
  created_at: string
}

/** One person's share of one deliverable's fee, in one budget month. The
 *  deliverable-side twin of TaskHourAllocation: it commits against the same
 *  workstream monthly budget the moment it is allocated, and becomes payable
 *  once the deliverable is accepted. Writable by a lead/admin only. */
export interface DeliverableFeeAllocation {
  id: string
  org_id: string
  deliverable_id: string
  profile_id: string
  department_id: string
  budget_month: string
  amount: number
  created_by: string | null
  created_at: string
}

/** v_deliverable_fee_weeks: an earned (accepted) fee mapped onto the timesheet
 *  week it becomes payable in, plus the project and deliverable it came from.
 *  `earned_date` is the acceptance date, not the due date or budget month. */
export interface DeliverableFeeWeek {
  allocation_id: string
  org_id: string
  user_id: string
  department_id: string
  budget_month: string
  amount: number
  week_start: string
  earned_date: string
  deliverable_id: string
  deliverable_title: string
  project_id: string
  project_name: string | null
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

/** A support request raised by anyone in the workspace. Private between the
 *  person who submitted it and the workspace admins — enforced by the
 *  `tickets_read` RLS policy, not by what the UI chooses to render. */
export interface Ticket {
  id: string
  org_id: string
  /** Sequential per workspace, shown as "#14". Assigned server-side. */
  ticket_number: number
  subject: string
  description: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  submitted_by: string
  assigned_to: string | null
  resolved_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface TicketComment {
  id: string
  org_id: string
  ticket_id: string
  author_id: string
  body: string
  /** Admin-only note. The submitter never receives it (RLS filters the row)
   *  and it fires no notification. */
  is_internal: boolean
  created_at: string
}

export interface TicketAttachment {
  id: string
  org_id: string
  ticket_id: string
  added_by: string
  file_path: string
  file_name: string
  file_size: number | null
  content_type: string | null
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
  /** Null on an untracked (internal) project — see Project.length_months. */
  length_months: number | null
  /** Computed from start_date + length_months — display only, not editable. */
  target_end_date: string | null
  /** Null on an untracked (internal) project, which also drives pct_amount,
   *  remaining_amount and projected_amount to null in the view. */
  budget_amount: number | null
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
  /** 'hours' = logged time x cost rate. 'fee' = an accepted deliverable's fee,
   *  which carries no hours. Both are owed for the period and sum together. */
  kind: 'hours' | 'fee'
}

/** A grouped row (by employee, or by project) with summed hours/amount. */
export interface PayrollLineItem {
  id: string
  name: string
  hours: number
  amount: number
}

/** One workspace the signed-in person can switch into (public.my_workspaces()). */
export interface WorkspaceMembership {
  org_id: string
  name: string
  slug: string
  role: UserRole
  /** True for the workspace this session is currently in — NOT the membership's
   *  own is_active flag, which means "not deactivated". */
  is_current: boolean
}

/** A workspace, as the settings page edits it. `slug` is not editable in the
 *  UI: it is the workspace's address and changing it would break saved links. */
export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  brand_color: string
  timezone: string
  /** ISO 4217. Applied to every money() call — see setWorkspaceCurrency. */
  currency: string
  /** 1 = Monday, 0 = Sunday. */
  week_start: number
  /** Drives ensure_pay_periods(). Changing it only adds future periods;
   *  existing ones, closed or paid, are never rewritten. */
  pay_period_cadence: PayPeriodCadence
  default_capacity_hours: number
  /** 'pending_deletion' after delete_workspace() — hidden from switchers,
   *  current_org_id() skips it. A future purge job hard-deletes past a
   *  grace period; nothing purges it today. */
  status: 'active' | 'pending_deletion'
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/** An email domain that can sign in to a workspace without an invite. */
export interface OrgEmailDomain {
  domain: string
  org_id: string
  created_at: string
}
