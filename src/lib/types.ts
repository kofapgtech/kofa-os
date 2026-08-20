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
export type NotificationType =
  | 'task_assigned'
  | 'deliverable_review'
  | 'deliverable_approved'
  | 'budget_threshold'
  | 'timer_running'
  | 'time_extension_requested'
  | 'time_extension_decided'

export interface Department {
  id: string
  org_id: string
  name: string
  color: string
}

/** A work stream: a named sub-track of work within one specific project. */
export interface Workstream {
  id: string
  org_id: string
  project_id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface WorkstreamMember {
  workstream_id: string
  profile_id: string
  /** Coordination authority within this one workstream: can reassign tasks
   *  and decide time-extension requests on its project. Not a global role. */
  is_lead: boolean
  added_by: string | null
  added_at: string
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
  department_id: string | null
  name: string
  code: string | null
  description: string | null
  status: ProjectStatus
  start_date: string | null
  due_date: string | null
  budget_amount: number
  budget_hours: number
  default_billable: boolean
  lead_id: string | null
}

export interface Task {
  id: string
  org_id: string
  project_id: string
  parent_task_id: string | null
  /** Set by nothing in the UI yet — approval-authority checks are scoped to
   *  the whole project until this is wired up (see task_time_requests). */
  workstream_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  due_date: string | null
  estimated_hours: number | null
  position: number
  created_by: string | null
  completed_at: string | null
  created_at: string
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
  file_path: string | null
  version: number
  approved_at: string | null
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
  department_id: string | null
  department_name: string | null
  name: string
  code: string | null
  status: ProjectStatus
  start_date: string | null
  due_date: string | null
  lead_id: string | null
  budget_amount: number
  budget_hours: number
  total_hours: number
  billable_hours: number
  accrued_amount: number | null
  accrued_cost: number | null
  pct_hours: number | null
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
    due_date: string | null
    budget_hours: number
    hours_logged: number
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
