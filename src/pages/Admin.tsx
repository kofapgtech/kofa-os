import { useState, type ReactNode } from 'react'
import { Building2, FolderPlus, Plus, UserPlus, Users2, Waypoints } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useAccounts,
  useAddWorkstreamMember,
  useAllProfiles,
  useCreateAccount,
  useCreateProject,
  useCreateWorkstream,
  useDepartments,
  useInviteEmployee,
  useProfiles,
  useProjectBudgets,
  useRemoveWorkstreamMember,
  useSetWorkstreamLead,
  useUpdateAccount,
  useUpdateProfile,
  useUpdateProject,
  useWorkstreamMembers,
  useWorkstreams,
} from '@/lib/queries'
import { EmptyState, PageHeader, Spinner } from '@/components/ui'
import { PROJECT_STATUS_LABEL } from '@/lib/format'
import type {
  Account,
  AccountStatus,
  Department,
  EmploymentType,
  Profile,
  Project,
  ProjectBudget,
  UserRole,
  Workstream,
} from '@/lib/types'

const ACCOUNT_STATUS: AccountStatus[] = ['prospect', 'active', 'paused', 'closed']
const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  prospect: 'Prospect',
  active: 'Active',
  paused: 'Paused',
  closed: 'Closed',
}
const PROJECT_STATUS: Project['status'][] = ['planning', 'active', 'on_hold', 'completed', 'archived']

const ALL_ROLES: UserRole[] = ['staff', 'dept_lead', 'billing_finance', 'hr_manager', 'executive', 'admin']
// What an HR viewer may assign to someone else — never a privileged tier,
// matching the same guard enforced server-side (RLS + the invite-employee
// Edge Function). Admin/executive viewers get the full ALL_ROLES list.
const HR_ASSIGNABLE_ROLES: UserRole[] = ['staff', 'dept_lead']
const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  executive: 'Executive',
  dept_lead: 'Department lead',
  billing_finance: 'Billing/Finance',
  hr_manager: 'HR',
  staff: 'Staff',
}
const EMPLOYMENT_TYPES: EmploymentType[] = ['employee', 'contractor']
const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = { employee: 'Employee', contractor: 'Contractor' }

export function Admin() {
  const { profile, isAdmin, isAdminOrExecutive, isHR } = useAuth()

  if (!isAdminOrExecutive && !isHR) {
    return <EmptyState title="No admin access" hint="Ask an admin for access to this page." />
  }

  // HR sees only the people-management slice: inviting and editing the
  // roster. Accounts, projects, rates, and work streams stay admin/executive
  // only - HR never reaches those cards, not just a hidden button.
  return (
    <div>
      <PageHeader
        title="Admin"
        subtitle={
          isAdminOrExecutive
            ? 'Create accounts, projects, and employees, and assign people to work streams.'
            : 'Invite employees and manage the roster.'
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {isAdminOrExecutive && <NewAccountCard orgId={profile!.org_id} />}
        {isAdminOrExecutive && <NewProjectCard orgId={profile!.org_id} />}
        {/* Executive deliberately excluded - inviting stays admin/HR only.
            Only a true admin can invite an admin/executive/billing/HR peer;
            HR's invite rights are capped to staff/dept_lead, enforced again
            server-side since this card can't be trusted to be the only gate. */}
        {(isAdmin || isHR) && <InviteEmployeeCard isAdmin={isAdmin} />}
        {isAdminOrExecutive && <WorkstreamsCard orgId={profile!.org_id} actorId={profile!.id} />}
        {isAdminOrExecutive && (
          <div className="xl:col-span-2">
            <ManageAccountsCard />
          </div>
        )}
        {isAdminOrExecutive && (
          <div className="xl:col-span-2">
            <ManageProjectsCard />
          </div>
        )}
        <div className="xl:col-span-2">
          <EmployeesCard isAdmin={isAdmin} />
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <p className="text-sm font-semibold text-ink-900">{title}</p>
      </div>
      {children}
    </div>
  )
}

function NewAccountCard({ orgId }: { orgId: string }) {
  const create = useCreateAccount()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [status, setStatus] = useState<AccountStatus>('prospect')
  const [done, setDone] = useState(false)

  async function submit() {
    await create.mutateAsync({
      org_id: orgId,
      name: name.trim(),
      code: code.trim() || null,
      primary_contact_name: contactName.trim() || null,
      primary_contact_email: contactEmail.trim() || null,
      status,
      owner_id: null,
    })
    setName('')
    setCode('')
    setContactName('')
    setContactEmail('')
    setStatus('prospect')
    setDone(true)
    window.setTimeout(() => setDone(false), 2500)
  }

  return (
    <Section title="New account" icon={<Building2 size={16} className="text-brand-600" />}>
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Client name"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Code</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)}>
              {ACCOUNT_STATUS.map((s) => (
                <option key={s} value={s}>
                  {ACCOUNT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Contact name</label>
            <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <label className="label">Contact email</label>
            <input
              className="input"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
        </div>
        <button
          className="btn-primary w-full"
          disabled={!name.trim() || create.isPending}
          onClick={() => void submit()}
        >
          <Plus size={16} /> Create account
        </button>
        {done && <p className="text-sm text-brand-700">Account created.</p>}
        {create.isError && <p className="text-sm text-rose-600">{(create.error as Error).message}</p>}
      </div>
    </Section>
  )
}

function ManageAccountsCard() {
  const { data: accounts = [], isLoading } = useAccounts()
  const update = useUpdateAccount()

  return (
    <Section title="Manage accounts" icon={<Building2 size={16} className="text-brand-600" />}>
      {isLoading ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <EmptyState title="No accounts yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Code</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Contact name</th>
                <th className="py-2 pr-3">Contact email</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <AccountRow key={a.id} account={a} onSave={(patch) => update.mutate({ id: a.id, patch })} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {update.isError && <p className="mt-2 text-sm text-rose-600">{(update.error as Error).message}</p>}
    </Section>
  )
}

function AccountRow({
  account,
  onSave,
}: {
  account: Account
  onSave: (patch: Partial<Omit<Account, 'id' | 'org_id'>>) => void
}) {
  const [name, setName] = useState(account.name)
  const [code, setCode] = useState(account.code ?? '')
  const [contactName, setContactName] = useState(account.primary_contact_name ?? '')
  const [contactEmail, setContactEmail] = useState(account.primary_contact_email ?? '')

  return (
    <tr className="border-b border-cream-200 last:border-0">
      <td className="py-2 pr-3">
        <input
          className="input !py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== account.name && onSave({ name: name.trim() })}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          className="input !py-1 !w-24"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onBlur={() => (code.trim() || null) !== account.code && onSave({ code: code.trim() || null })}
        />
      </td>
      <td className="py-2 pr-3">
        <select
          className="input !w-auto !py-1"
          value={account.status}
          onChange={(e) => onSave({ status: e.target.value as AccountStatus })}
        >
          {ACCOUNT_STATUS.map((s) => (
            <option key={s} value={s}>
              {ACCOUNT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <input
          className="input !py-1"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          onBlur={() =>
            (contactName.trim() || null) !== account.primary_contact_name &&
            onSave({ primary_contact_name: contactName.trim() || null })
          }
        />
      </td>
      <td className="py-2 pr-3">
        <input
          className="input !py-1"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          onBlur={() =>
            (contactEmail.trim() || null) !== account.primary_contact_email &&
            onSave({ primary_contact_email: contactEmail.trim() || null })
          }
        />
      </td>
    </tr>
  )
}

function NewProjectCard({ orgId }: { orgId: string }) {
  const { data: accounts = [] } = useAccounts()
  const { data: departments = [] } = useDepartments()
  const { data: people = [] } = useProfiles()
  const create = useCreateProject()

  const [accountId, setAccountId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Project['status']>('planning')
  const [leadId, setLeadId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [budgetHours, setBudgetHours] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [done, setDone] = useState(false)

  async function submit() {
    await create.mutateAsync({
      org_id: orgId,
      account_id: accountId,
      department_id: departmentId || null,
      name: name.trim(),
      code: code.trim() || null,
      description: null,
      status,
      start_date: null,
      due_date: dueDate || null,
      budget_amount: budgetAmount ? Number(budgetAmount) : 0,
      budget_hours: budgetHours ? Number(budgetHours) : 0,
      default_billable: true,
      lead_id: leadId || null,
    })
    setAccountId('')
    setDepartmentId('')
    setName('')
    setCode('')
    setStatus('planning')
    setLeadId('')
    setDueDate('')
    setBudgetHours('')
    setBudgetAmount('')
    setDone(true)
    window.setTimeout(() => setDone(false), 2500)
  }

  const canSubmit = !!accountId && !!name.trim()

  return (
    <Section title="New project" icon={<FolderPlus size={16} className="text-brand-600" />}>
      <div className="space-y-3">
        <div>
          <label className="label">Account</label>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Select an account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Code</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Project['status'])}>
              {PROJECT_STATUS.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Lead</label>
            <select className="input" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Due date</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Budget hours</label>
            <input
              className="input"
              type="number"
              min="0"
              value={budgetHours}
              onChange={(e) => setBudgetHours(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Budget amount</label>
            <input
              className="input"
              type="number"
              min="0"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
            />
          </div>
        </div>
        <button className="btn-primary w-full" disabled={!canSubmit || create.isPending} onClick={() => void submit()}>
          <Plus size={16} /> Create project
        </button>
        {done && <p className="text-sm text-brand-700">Project created.</p>}
        {create.isError && <p className="text-sm text-rose-600">{(create.error as Error).message}</p>}
      </div>
    </Section>
  )
}

function ManageProjectsCard() {
  const { data: projects = [], isLoading } = useProjectBudgets()
  const { data: accounts = [] } = useAccounts()
  const { data: departments = [] } = useDepartments()
  const { data: people = [] } = useProfiles()
  const update = useUpdateProject()

  return (
    <Section title="Manage projects" icon={<FolderPlus size={16} className="text-brand-600" />}>
      {isLoading ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <EmptyState title="No projects yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Department</th>
                <th className="py-2 pr-3">Lead</th>
                <th className="py-2 pr-3">Due</th>
                <th className="py-2 pr-3">Budget h</th>
                <th className="py-2 pr-3">Budget $</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <ProjectRow
                  key={p.project_id}
                  project={p}
                  accounts={accounts}
                  departments={departments}
                  people={people}
                  onSave={(patch) => update.mutate({ id: p.project_id, patch })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {update.isError && <p className="mt-2 text-sm text-rose-600">{(update.error as Error).message}</p>}
    </Section>
  )
}

function ProjectRow({
  project,
  accounts,
  departments,
  people,
  onSave,
}: {
  project: ProjectBudget
  accounts: Account[]
  departments: Department[]
  people: Profile[]
  onSave: (patch: Partial<Omit<Project, 'id' | 'org_id'>>) => void
}) {
  const [name, setName] = useState(project.name)
  const [dueDate, setDueDate] = useState(project.due_date ?? '')
  const [budgetHours, setBudgetHours] = useState(String(project.budget_hours))
  const [budgetAmount, setBudgetAmount] = useState(String(project.budget_amount))

  return (
    <tr className="border-b border-cream-200 last:border-0">
      <td className="py-2 pr-3">
        <input
          className="input !py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== project.name && onSave({ name: name.trim() })}
        />
      </td>
      <td className="py-2 pr-3">
        <select
          className="input !w-auto !py-1"
          value={project.account_id}
          onChange={(e) => onSave({ account_id: e.target.value })}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          className="input !w-auto !py-1"
          value={project.status}
          onChange={(e) => onSave({ status: e.target.value as Project['status'] })}
        >
          {PROJECT_STATUS.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          className="input !w-auto !py-1"
          value={project.department_id ?? ''}
          onChange={(e) => onSave({ department_id: e.target.value || null })}
        >
          <option value="">No department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          className="input !w-auto !py-1"
          value={project.lead_id ?? ''}
          onChange={(e) => onSave({ lead_id: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <input
          className="input !py-1"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          onBlur={() => (dueDate || null) !== project.due_date && onSave({ due_date: dueDate || null })}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          className="input !py-1 !w-20"
          type="number"
          min="0"
          value={budgetHours}
          onChange={(e) => setBudgetHours(e.target.value)}
          onBlur={() => {
            const n = Number(budgetHours) || 0
            if (n !== project.budget_hours) onSave({ budget_hours: n })
          }}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          className="input !py-1 !w-24"
          type="number"
          min="0"
          value={budgetAmount}
          onChange={(e) => setBudgetAmount(e.target.value)}
          onBlur={() => {
            const n = Number(budgetAmount) || 0
            if (n !== project.budget_amount) onSave({ budget_amount: n })
          }}
        />
      </td>
    </tr>
  )
}

function InviteEmployeeCard({ isAdmin }: { isAdmin: boolean }) {
  const { data: departments = [] } = useDepartments()
  const invite = useInviteEmployee()

  // HR sees the same card, just capped to non-privileged roles - the server
  // (RLS + the Edge Function) enforces this independently either way.
  const assignableRoles = isAdmin ? ALL_ROLES : HR_ASSIGNABLE_ROLES

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('staff')
  const [employmentType, setEmploymentType] = useState<EmploymentType>('employee')
  const [departmentId, setDepartmentId] = useState('')
  const [title, setTitle] = useState('')
  const [capacity, setCapacity] = useState('40')
  const [done, setDone] = useState(false)

  async function submit() {
    await invite.mutateAsync({
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      role,
      department_id: departmentId || null,
      title: title.trim() || null,
      capacity_hours_per_week: capacity ? Number(capacity) : 40,
      employment_type: employmentType,
    })
    setFullName('')
    setEmail('')
    setRole('staff')
    setEmploymentType('employee')
    setDepartmentId('')
    setTitle('')
    setCapacity('40')
    setDone(true)
    window.setTimeout(() => setDone(false), 3000)
  }

  const canSubmit = !!fullName.trim() && !!email.trim()

  return (
    <Section title="Invite employee" icon={<UserPlus size={16} className="text-brand-600" />}>
      <div className="space-y-3">
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">Work email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@kofapg.com"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Employment type</label>
            <select
              className="input"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="label">Capacity (h/wk)</label>
            <input
              className="input"
              type="number"
              min="0"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
        </div>
        <button className="btn-primary w-full" disabled={!canSubmit || invite.isPending} onClick={() => void submit()}>
          <UserPlus size={16} /> Send invite
        </button>
        {done && <p className="text-sm text-brand-700">Invite sent — they'll get an email to set up access.</p>}
        {invite.isError && <p className="text-sm text-rose-600">{(invite.error as Error).message}</p>}
      </div>
    </Section>
  )
}

function EmployeesCard({ isAdmin }: { isAdmin: boolean }) {
  const { data: people = [], isLoading } = useAllProfiles()
  const { data: departments = [] } = useDepartments()
  const update = useUpdateProfile()

  return (
    <Section title="Employees" icon={<Users2 size={16} className="text-brand-600" />}>
      {isLoading ? (
        <Spinner />
      ) : people.length === 0 ? (
        <EmptyState title="No employees yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Department</th>
                <th className="py-2 pr-3">Capacity</th>
                <th className="py-2 pr-3">Active</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <EmployeeRow
                  key={p.id}
                  person={p}
                  departments={departments}
                  isAdmin={isAdmin}
                  onSave={(patch) => update.mutate({ id: p.id, patch })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {update.isError && <p className="mt-2 text-sm text-rose-600">{(update.error as Error).message}</p>}
    </Section>
  )
}

function EmployeeRow({
  person,
  departments,
  isAdmin,
  onSave,
}: {
  person: Profile
  departments: Department[]
  isAdmin: boolean
  onSave: (
    patch: Partial<
      Pick<
        Profile,
        'full_name' | 'department_id' | 'role' | 'title' | 'capacity_hours_per_week' | 'is_active' | 'employment_type'
      >
    >,
  ) => void
}) {
  const [fullName, setFullName] = useState(person.full_name)
  const [title, setTitle] = useState(person.title ?? '')
  const [capacity, setCapacity] = useState(String(person.capacity_hours_per_week))

  // HR can only reassign someone into (or edit someone already in) a
  // non-privileged role - RLS enforces the same boundary independently, this
  // just avoids offering a choice the database will reject.
  const isPrivileged = !HR_ASSIGNABLE_ROLES.includes(person.role)
  const roleOptions = isAdmin ? ALL_ROLES : isPrivileged ? [person.role] : HR_ASSIGNABLE_ROLES
  const rowLocked = !isAdmin && isPrivileged

  return (
    <tr className={`border-b border-cream-200 last:border-0 ${person.is_active ? '' : 'opacity-50'}`}>
      <td className="py-2 pr-3">
        <input
          className="input !py-1"
          value={fullName}
          disabled={rowLocked}
          onChange={(e) => setFullName(e.target.value)}
          onBlur={() => fullName.trim() && fullName.trim() !== person.full_name && onSave({ full_name: fullName.trim() })}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          className="input !py-1"
          value={title}
          disabled={rowLocked}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => (title.trim() || null) !== person.title && onSave({ title: title.trim() || null })}
        />
      </td>
      <td className="py-2 pr-3 text-ink-500">{person.email}</td>
      <td className="py-2 pr-3">
        <select
          className="input !w-auto !py-1"
          value={person.role}
          disabled={rowLocked}
          onChange={(e) => onSave({ role: e.target.value as UserRole })}
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          className="input !w-auto !py-1"
          value={person.employment_type}
          disabled={rowLocked}
          onChange={(e) => onSave({ employment_type: e.target.value as EmploymentType })}
        >
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMPLOYMENT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          className="input !w-auto !py-1"
          value={person.department_id ?? ''}
          disabled={rowLocked}
          onChange={(e) => onSave({ department_id: e.target.value || null })}
        >
          <option value="">No department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <input
          className="input !py-1 !w-16"
          type="number"
          min="0"
          value={capacity}
          disabled={rowLocked}
          onChange={(e) => setCapacity(e.target.value)}
          onBlur={() => {
            const n = Number(capacity) || 0
            if (n !== person.capacity_hours_per_week) onSave({ capacity_hours_per_week: n })
          }}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          type="checkbox"
          checked={person.is_active}
          disabled={rowLocked}
          title={rowLocked ? 'Only an admin can change this' : person.is_active ? 'Deactivate' : 'Reactivate'}
          onChange={(e) => onSave({ is_active: e.target.checked })}
        />
      </td>
    </tr>
  )
}

function WorkstreamsCard({ orgId, actorId }: { orgId: string; actorId: string }) {
  const { data: projects = [] } = useProjectBudgets()
  const { data: people = [] } = useProfiles()
  const [projectId, setProjectId] = useState('')
  const { data: workstreams = [] } = useWorkstreams(projectId || undefined)
  const createWs = useCreateWorkstream()
  const [wsName, setWsName] = useState('')

  return (
    <Section title="Work streams" icon={<Waypoints size={16} className="text-brand-600" />}>
      <p className="mb-3 text-sm text-ink-500">
        A work stream is a track of work within one project — pick a project, then create streams and
        add employees to them. The star marks a stream's lead, who can reassign tasks and decide time
        requests anywhere on this project.
      </p>
      <div className="mb-3">
        <label className="label">Project</label>
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.project_id} value={p.project_id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {projectId && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="New work stream name"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
            />
            <button
              className="btn-primary shrink-0"
              disabled={!wsName.trim() || createWs.isPending}
              onClick={async () => {
                await createWs.mutateAsync({
                  org_id: orgId,
                  project_id: projectId,
                  name: wsName.trim(),
                  description: null,
                  created_by: actorId,
                })
                setWsName('')
              }}
            >
              <Plus size={16} /> Add
            </button>
          </div>
          {createWs.isError && <p className="text-sm text-rose-600">{(createWs.error as Error).message}</p>}

          {workstreams.length === 0 ? (
            <EmptyState title="No work streams on this project yet." />
          ) : (
            <div className="space-y-3">
              {workstreams.map((ws) => (
                <WorkstreamRow key={ws.id} workstream={ws} people={people} actorId={actorId} />
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

function WorkstreamRow({
  workstream,
  people,
  actorId,
}: {
  workstream: Workstream
  people: Profile[]
  actorId: string
}) {
  const { data: members = [] } = useWorkstreamMembers(workstream.id)
  const addMember = useAddWorkstreamMember()
  const removeMember = useRemoveWorkstreamMember()
  const setLead = useSetWorkstreamLead()
  const [pick, setPick] = useState('')

  const memberIds = new Set(members.map((m) => m.profile_id))
  const available = people.filter((p) => !memberIds.has(p.id))

  return (
    <div className="rounded-xl border border-cream-300 p-3">
      <p className="text-sm font-semibold text-ink-900">{workstream.name}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {members.map((m) => (
          <span
            key={m.profile_id}
            className={`chip inline-flex items-center gap-1 ${m.is_lead ? 'bg-accent-200 text-accent-700' : 'bg-brand-100 text-brand-700'}`}
          >
            <button
              title={m.is_lead ? 'Remove as lead' : 'Make lead of this work stream'}
              onClick={() =>
                setLead.mutate({ workstream_id: workstream.id, profile_id: m.profile_id, is_lead: !m.is_lead })
              }
            >
              {m.is_lead ? '★' : '☆'}
            </button>
            {m.profile.full_name}
            <button
              className="text-current/60 hover:text-current"
              title="Remove from work stream"
              onClick={() =>
                removeMember.mutate({ workstream_id: workstream.id, profile_id: m.profile_id })
              }
            >
              ×
            </button>
          </span>
        ))}
        {members.length === 0 && <span className="text-xs text-ink-500">No one added yet.</span>}
      </div>
      {available.length > 0 && (
        <div className="mt-2 flex gap-2">
          <select className="input !w-auto !py-1" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Add employee…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <button
            className="btn-ghost"
            disabled={!pick || addMember.isPending}
            onClick={async () => {
              await addMember.mutateAsync({ workstream_id: workstream.id, profile_id: pick, added_by: actorId })
              setPick('')
            }}
          >
            <Plus size={15} /> Add
          </button>
        </div>
      )}
      {(addMember.isError || removeMember.isError || setLead.isError) && (
        <p className="mt-1 text-sm text-rose-600">
          {((addMember.error ?? removeMember.error ?? setLead.error) as Error).message}
        </p>
      )}
    </div>
  )
}
