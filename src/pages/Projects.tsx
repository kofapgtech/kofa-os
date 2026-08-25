import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useAccounts,
  useCreateProject,
  useDepartments,
  useProfiles,
  useProjectBudgets,
  useUpdateProject,
} from '@/lib/queries'
import { BurnBar, EmptyState, Modal, ModalHeader, PageHeader, Spinner } from '@/components/ui'
import {
  PROJECT_STATUS,
  PROJECT_STATUS_CLASS,
  PROJECT_STATUS_LABEL,
  hours,
  money,
  shortDate,
} from '@/lib/format'
import type { Account, Department, Profile, Project, ProjectBudget } from '@/lib/types'

export function Projects() {
  const { profile, isAdminOrExecutive, hasFinancialAccess } = useAuth()
  const { data: projects = [], isLoading } = useProjectBudgets()
  const { data: departments = [] } = useDepartments()
  const [dept, setDept] = useState('all')
  const [status, setStatus] = useState('active')
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<ProjectBudget | null>(null)

  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          (dept === 'all' || p.department_id === dept) &&
          (status === 'all' || p.status === status),
      ),
    [projects, dept, status],
  )

  if (isLoading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={
          hasFinancialAccess
            ? 'Budget health across every account and department.'
            : 'Hours logged against every active engagement.'
        }
        actions={
          <>
            <select className="input !w-auto" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="all">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {Object.entries(PROJECT_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {isAdminOrExecutive && (
              <button className="btn-primary shrink-0" onClick={() => setShowNew(true)}>
                <Plus size={16} /> New project
              </button>
            )}
          </>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState title="No projects match these filters." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <div key={p.project_id} className="card p-4 hover:border-brand-300">
              <Link to={`/projects/${p.project_id}`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">{p.name}</p>
                    <p className="truncate text-xs text-ink-500">
                      {p.account_name} · {p.department_name ?? 'No department'}
                    </p>
                  </div>
                  <span className={`chip shrink-0 ${PROJECT_STATUS_CLASS[p.status]}`}>
                    {PROJECT_STATUS_LABEL[p.status]}
                  </span>
                </div>

                <div className="mt-4">
                  {/* Staff see the hours bar; leadership see the money bar. */}
                  <BurnBar percent={hasFinancialAccess ? p.pct_amount : p.pct_hours} />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-ink-500">Hours</p>
                    <p className="font-semibold tabular-nums text-ink-900">
                      {hours(p.total_hours)}
                      <span className="font-normal text-ink-400"> / {p.budget_hours}h</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-500">Spend</p>
                    <p className="font-semibold tabular-nums text-ink-900">
                      {money(p.accrued_amount)}
                      {hasFinancialAccess && (
                        <span className="font-normal text-ink-400"> / {money(p.budget_amount)}</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-500">Due</p>
                    <p className="font-semibold text-ink-900">{shortDate(p.due_date)}</p>
                  </div>
                </div>

                {/* 5% tolerance so rounding noise doesn't cry wolf on healthy projects. */}
                {hasFinancialAccess && p.projected_amount !== null && p.projected_amount > p.budget_amount * 1.05 && (
                  <p className="mt-3 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700">
                    Projected {money(p.projected_amount)} at current burn — {money(p.projected_amount - p.budget_amount)} over.
                  </p>
                )}
              </Link>

              {isAdminOrExecutive && (
                <button
                  className="btn-ghost mt-3 w-full !py-1.5"
                  onClick={() => setEditing(p)}
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && <NewProjectModal orgId={profile!.org_id} onClose={() => setShowNew(false)} />}
      {editing && <EditProjectModal project={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ProjectFields({
  accounts,
  departments,
  people,
  accountId,
  setAccountId,
  name,
  setName,
  code,
  setCode,
  status,
  setStatus,
  departmentId,
  setDepartmentId,
  leadId,
  setLeadId,
  dueDate,
  setDueDate,
  budgetHours,
  setBudgetHours,
  budgetAmount,
  setBudgetAmount,
}: {
  accounts: Account[]
  departments: Department[]
  people: Profile[]
  accountId: string
  setAccountId: (v: string) => void
  name: string
  setName: (v: string) => void
  code: string
  setCode: (v: string) => void
  status: Project['status']
  setStatus: (v: Project['status']) => void
  departmentId: string
  setDepartmentId: (v: string) => void
  leadId: string
  setLeadId: (v: string) => void
  dueDate: string
  setDueDate: (v: string) => void
  budgetHours: string
  setBudgetHours: (v: string) => void
  budgetAmount: string
  setBudgetAmount: (v: string) => void
}) {
  return (
    <>
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
    </>
  )
}

function NewProjectModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
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
    onClose()
  }

  const canSubmit = !!accountId && !!name.trim()

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="New project" icon={<FolderPlus size={16} className="text-brand-600" />} onClose={onClose} />
      <div className="space-y-3">
        <ProjectFields
          accounts={accounts}
          departments={departments}
          people={people}
          accountId={accountId}
          setAccountId={setAccountId}
          name={name}
          setName={setName}
          code={code}
          setCode={setCode}
          status={status}
          setStatus={setStatus}
          departmentId={departmentId}
          setDepartmentId={setDepartmentId}
          leadId={leadId}
          setLeadId={setLeadId}
          dueDate={dueDate}
          setDueDate={setDueDate}
          budgetHours={budgetHours}
          setBudgetHours={setBudgetHours}
          budgetAmount={budgetAmount}
          setBudgetAmount={setBudgetAmount}
        />
        <button
          className="btn-primary w-full"
          disabled={!canSubmit || create.isPending}
          onClick={() => void submit()}
        >
          <Plus size={16} /> Create project
        </button>
      </div>
    </Modal>
  )
}

function EditProjectModal({ project, onClose }: { project: ProjectBudget; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts()
  const { data: departments = [] } = useDepartments()
  const { data: people = [] } = useProfiles()
  const update = useUpdateProject()

  const [accountId, setAccountId] = useState(project.account_id)
  const [departmentId, setDepartmentId] = useState(project.department_id ?? '')
  const [name, setName] = useState(project.name)
  const [code, setCode] = useState(project.code ?? '')
  const [status, setStatus] = useState<Project['status']>(project.status)
  const [leadId, setLeadId] = useState(project.lead_id ?? '')
  const [dueDate, setDueDate] = useState(project.due_date ?? '')
  const [budgetHours, setBudgetHours] = useState(String(project.budget_hours))
  const [budgetAmount, setBudgetAmount] = useState(String(project.budget_amount))
  const [done, setDone] = useState(false)

  async function submit() {
    await update.mutateAsync({
      id: project.project_id,
      patch: {
        account_id: accountId,
        department_id: departmentId || null,
        name: name.trim(),
        code: code.trim() || null,
        status,
        due_date: dueDate || null,
        budget_amount: budgetAmount ? Number(budgetAmount) : 0,
        budget_hours: budgetHours ? Number(budgetHours) : 0,
        lead_id: leadId || null,
      },
    })
    setDone(true)
    window.setTimeout(onClose, 1200)
  }

  function del() {
    const ok = window.confirm(
      `Delete "${project.name}"? This archives the project. Logged hours, invoices, and payment history are kept, and this can be undone by editing the status back.`,
    )
    if (ok) update.mutate({ id: project.project_id, patch: { status: 'archived' } }, { onSuccess: onClose })
  }

  const canSubmit = !!accountId && !!name.trim()

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Edit project" icon={<Pencil size={16} className="text-brand-600" />} onClose={onClose} />
      <div className="space-y-3">
        <ProjectFields
          accounts={accounts}
          departments={departments}
          people={people}
          accountId={accountId}
          setAccountId={setAccountId}
          name={name}
          setName={setName}
          code={code}
          setCode={setCode}
          status={status}
          setStatus={setStatus}
          departmentId={departmentId}
          setDepartmentId={setDepartmentId}
          leadId={leadId}
          setLeadId={setLeadId}
          dueDate={dueDate}
          setDueDate={setDueDate}
          budgetHours={budgetHours}
          setBudgetHours={setBudgetHours}
          budgetAmount={budgetAmount}
          setBudgetAmount={setBudgetAmount}
        />
        <button
          className="btn-primary w-full"
          disabled={!canSubmit || update.isPending}
          onClick={() => void submit()}
        >
          <Check size={16} /> Save changes
        </button>
        {done && <p className="text-sm text-brand-700">Project updated.</p>}

        <div className="border-t border-cream-300 pt-3">
          <button className="btn-danger w-full" disabled={update.isPending} onClick={del}>
            <Trash2 size={16} /> Delete project
          </button>
        </div>
      </div>
    </Modal>
  )
}
