import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useAccounts, useCreateProject, useProjectBudgets, useUpdateProject } from '@/lib/queries'
import { BurnBar, ConfirmDialog, EmptyState, Modal, ModalHeader, PageHeader, Spinner } from '@/components/ui'
import { PROJECT_STATUS, PROJECT_STATUS_CLASS, PROJECT_STATUS_LABEL, hours, money } from '@/lib/format'
import type { Account, Project, ProjectBudget } from '@/lib/types'

export function Projects() {
  const { profile, isAdminOrExecutive, hasFinancialAccess } = useAuth()
  const { data: projects = [], isLoading } = useProjectBudgets()
  const [status, setStatus] = useState('active')
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<ProjectBudget | null>(null)

  const filtered = useMemo(
    () => projects.filter((p) => status === 'all' || p.status === status),
    [projects, status],
  )

  if (isLoading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={
          hasFinancialAccess
            ? 'Budget health across every account.'
            : 'Hours logged against every active engagement.'
        }
        actions={
          <>
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
                    <p className="truncate text-xs text-ink-500">{p.account_name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`chip ${PROJECT_STATUS_CLASS[p.status]}`}>
                      {PROJECT_STATUS_LABEL[p.status]}
                    </span>
                    {isAdminOrExecutive && (
                      <button
                        type="button"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-brand-50 hover:text-brand-600"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setEditing(p)
                        }}
                        title="Edit project"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  {p.budget_amount === null ? (
                    <span className="chip bg-brand-100 text-brand-700">Internal · no budget</span>
                  ) : (
                    <BurnBar percent={p.pct_amount} />
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-ink-500">Hours logged</p>
                    <p className="font-semibold tabular-nums text-ink-900">{hours(p.total_hours)}</p>
                  </div>
                  {p.budget_amount === null ? (
                    <div>
                      <p className="text-ink-500">Internal cost</p>
                      <p className="font-semibold tabular-nums text-ink-900">
                        {hasFinancialAccess ? money(p.accrued_cost) : '—'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-ink-500">Spend</p>
                      <p className="font-semibold tabular-nums text-ink-900">
                        {money(p.accrued_amount)}
                        {hasFinancialAccess && (
                          <span className="font-normal text-ink-400"> / {money(p.budget_amount)}</span>
                        )}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-ink-500">Length</p>
                    <p className="font-semibold text-ink-900">
                      {p.length_months === null
                        ? 'Open-ended'
                        : `${p.length_months} ${p.length_months === 1 ? 'mo' : 'mos'}`}
                    </p>
                  </div>
                </div>

                {/* 5% tolerance so rounding noise doesn't cry wolf on healthy projects. */}
                {hasFinancialAccess &&
                  p.budget_amount !== null &&
                  p.projected_amount !== null &&
                  p.projected_amount > p.budget_amount * 1.05 && (
                    <p className="mt-3 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700">
                      Projected {money(p.projected_amount)} at current burn —{' '}
                      {money(p.projected_amount - p.budget_amount)} over.
                    </p>
                  )}
              </Link>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewProjectModal orgId={profile!.org_id} onClose={() => setShowNew(false)} />}
      {editing && <EditProjectModal project={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

const LENGTH_PRESETS = [1, 2, 3, 6, 12]

function ProjectFields({
  accounts,
  accountId,
  setAccountId,
  name,
  setName,
  code,
  setCode,
  status,
  setStatus,
  startDate,
  setStartDate,
  lengthMonths,
  setLengthMonths,
  budgetAmount,
  setBudgetAmount,
}: {
  accounts: Account[]
  accountId: string
  setAccountId: (v: string) => void
  name: string
  setName: (v: string) => void
  code: string
  setCode: (v: string) => void
  status: Project['status']
  setStatus: (v: Project['status']) => void
  startDate: string
  setStartDate: (v: string) => void
  /** null = open-ended. Only the internal account may set it. */
  lengthMonths: string | null
  setLengthMonths: (v: string | null) => void
  /** null = no budget tracked. Only the internal account may set it. */
  budgetAmount: string | null
  setBudgetAmount: (v: string | null) => void
}) {
  // Untracked projects live only on the internal account — the same rule the
  // projects_untracked_requires_internal trigger enforces in Postgres. Mirroring
  // it here means the form can never submit something the database will reject.
  const isInternal = !!accounts.find((a) => a.id === accountId)?.is_internal

  function chooseAccount(nextId: string) {
    setAccountId(nextId)
    if (!accounts.find((a) => a.id === nextId)?.is_internal) {
      if (lengthMonths === null) setLengthMonths('1')
      if (budgetAmount === null) setBudgetAmount('')
    }
  }

  return (
    <>
      <div>
        <label className="label">Account</label>
        <select className="input" value={accountId} onChange={(e) => chooseAccount(e.target.value)}>
          <option value="">Select an account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.is_internal ? ' — Internal' : ''}
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
          <label className="label">Start date</label>
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="label !mb-0">Length (months)</label>
            {isInternal && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-500">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  checked={lengthMonths !== null}
                  onChange={(e) => setLengthMonths(e.target.checked ? '1' : null)}
                />
                Set a length
              </label>
            )}
          </div>
          {lengthMonths === null ? (
            <p className="text-xs text-ink-500">Runs open-ended — no target end date.</p>
          ) : (
            <>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                value={lengthMonths}
                onChange={(e) => setLengthMonths(e.target.value)}
              />
              <div className="mt-1.5 flex gap-1.5">
                {LENGTH_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setLengthMonths(String(m))}
                    className={`chip cursor-pointer ${
                      Number(lengthMonths) === m ? 'bg-brand-700 text-white' : 'bg-cream-200 text-ink-600'
                    }`}
                  >
                    {m}mo
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="col-span-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="label !mb-0">Budget amount</label>
            {isInternal && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-500">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  checked={budgetAmount !== null}
                  onChange={(e) => setBudgetAmount(e.target.checked ? '' : null)}
                />
                Track a budget
              </label>
            )}
          </div>
          {budgetAmount === null ? (
            <p className="text-xs text-ink-500">
              No budget bar, burn %, or threshold alerts — hours and internal cost instead.
            </p>
          ) : (
            <input
              className="input"
              type="number"
              min="0"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
            />
          )}
        </div>
      </div>
      {budgetAmount !== null && (
        <p className="text-xs text-ink-500">
          The budget splits evenly across the length in months, starting from the start date — adjust the
          split on the project's Budget tab once it's created.
        </p>
      )}
      {isInternal && (
        <p className="text-xs text-ink-500">
          Internal projects log non-billable time by default. Only this account can go without a budget
          or an end date.
        </p>
      )}
    </>
  )
}

function NewProjectModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts()
  const create = useCreateProject()

  const [accountId, setAccountId] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Project['status']>('planning')
  const [startDate, setStartDate] = useState('')
  const [lengthMonths, setLengthMonths] = useState<string | null>('1')
  const [budgetAmount, setBudgetAmount] = useState<string | null>('')

  const isInternal = !!accounts.find((a) => a.id === accountId)?.is_internal

  // Picking the internal account switches the defaults to untracked — that is
  // the whole point of it — while any client account keeps both required.
  function chooseAccount(nextId: string) {
    setAccountId(nextId)
    if (accounts.find((a) => a.id === nextId)?.is_internal) {
      setLengthMonths(null)
      setBudgetAmount(null)
    } else {
      setLengthMonths((v) => v ?? '1')
      setBudgetAmount((v) => v ?? '')
    }
  }

  async function submit() {
    await create.mutateAsync({
      org_id: orgId,
      account_id: accountId,
      name: name.trim(),
      code: code.trim() || null,
      description: null,
      status,
      start_date: startDate || null,
      length_months: lengthMonths === null ? null : Math.max(1, Number(lengthMonths)),
      budget_amount: budgetAmount === null ? null : Number(budgetAmount) || 0,
      default_billable: !isInternal,
    })
    onClose()
  }

  const canSubmit =
    !!accountId && !!name.trim() && (lengthMonths === null || Number(lengthMonths) > 0)

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="New project" icon={<FolderPlus size={16} className="text-brand-600" />} onClose={onClose} />
      <div className="space-y-3">
        <ProjectFields
          accounts={accounts}
          accountId={accountId}
          setAccountId={chooseAccount}
          name={name}
          setName={setName}
          code={code}
          setCode={setCode}
          status={status}
          setStatus={setStatus}
          startDate={startDate}
          setStartDate={setStartDate}
          lengthMonths={lengthMonths}
          setLengthMonths={setLengthMonths}
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

export function EditProjectModal({ project, onClose }: { project: ProjectBudget; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts()
  const update = useUpdateProject()

  const [accountId, setAccountId] = useState(project.account_id)
  const [name, setName] = useState(project.name)
  const [code, setCode] = useState(project.code ?? '')
  const [status, setStatus] = useState<Project['status']>(project.status)
  const [startDate, setStartDate] = useState(project.start_date ?? '')
  const [lengthMonths, setLengthMonths] = useState<string | null>(
    project.length_months === null ? null : String(project.length_months),
  )
  const [budgetAmount, setBudgetAmount] = useState<string | null>(
    project.budget_amount === null ? null : String(project.budget_amount),
  )
  const [done, setDone] = useState(false)

  async function submit() {
    await update.mutateAsync({
      id: project.project_id,
      patch: {
        account_id: accountId,
        name: name.trim(),
        code: code.trim() || null,
        status,
        start_date: startDate || null,
        length_months: lengthMonths === null ? null : Math.max(1, Number(lengthMonths)),
        budget_amount: budgetAmount === null ? null : Number(budgetAmount) || 0,
      },
    })
    setDone(true)
    window.setTimeout(onClose, 1200)
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function del() {
    setConfirmingDelete(false)
    update.mutate({ id: project.project_id, patch: { status: 'archived' } }, { onSuccess: onClose })
  }

  const canSubmit =
    !!accountId && !!name.trim() && (lengthMonths === null || Number(lengthMonths) > 0)

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Edit project" icon={<Pencil size={16} className="text-brand-600" />} onClose={onClose} />
      <div className="space-y-3">
        <ProjectFields
          accounts={accounts}
          accountId={accountId}
          setAccountId={setAccountId}
          name={name}
          setName={setName}
          code={code}
          setCode={setCode}
          status={status}
          setStatus={setStatus}
          startDate={startDate}
          setStartDate={setStartDate}
          lengthMonths={lengthMonths}
          setLengthMonths={setLengthMonths}
          budgetAmount={budgetAmount}
          setBudgetAmount={setBudgetAmount}
        />
        {budgetAmount !== null && (
          <p className="text-xs text-ink-500">
            Changing the budget amount or start date here doesn't reflow the monthly split automatically —
            revisit the Budget tab to rebalance months after a change.
          </p>
        )}
        <button
          className="btn-primary w-full"
          disabled={!canSubmit || update.isPending}
          onClick={() => void submit()}
        >
          <Check size={16} /> Save changes
        </button>
        {done && <p className="text-sm text-brand-700">Project updated.</p>}

        <div className="border-t border-cream-300 pt-3">
          <button className="btn-danger w-full" disabled={update.isPending} onClick={() => setConfirmingDelete(true)}>
            <Trash2 size={16} /> Delete project
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${project.name}"?`}
          message="This archives the project. Logged hours, invoices, and payment history are kept, and this can be undone by editing the status back."
          busy={update.isPending}
          onConfirm={del}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </Modal>
  )
}
