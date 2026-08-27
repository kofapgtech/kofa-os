import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Check, Copy, ExternalLink, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useAccounts,
  useArchiveAccount,
  useCreateAccount,
  useCreateShareLink,
  useProjectBudgets,
  useShareLinks,
  useUpdateAccount,
} from '@/lib/queries'
import { BurnBar, ConfirmDialog, EmptyState, Modal, ModalHeader, PageHeader, Spinner } from '@/components/ui'
import { ACCOUNT_STATUS, ACCOUNT_STATUS_LABEL, PROJECT_STATUS_CLASS, PROJECT_STATUS_LABEL, hours, money } from '@/lib/format'
import type { Account, AccountStatus } from '@/lib/types'

export function Accounts() {
  const { profile, isAdminOrExecutive, hasFinancialAccess } = useAuth()
  const { data: allAccounts = [], isLoading } = useAccounts()
  const { data: projects = [] } = useProjectBudgets()
  const { data: links = [] } = useShareLinks()
  const createLink = useCreateShareLink()
  const [copied, setCopied] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  const closedCount = allAccounts.filter((a) => a.status === 'closed').length
  const accounts = showClosed ? allAccounts : allAccounts.filter((a) => a.status !== 'closed')

  function portalUrl(token: string) {
    return `${window.location.origin}/portal/${token}`
  }

  async function copy(token: string) {
    await navigator.clipboard.writeText(portalUrl(token))
    setCopied(token)
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Clients, their work, and their read-only portal links."
        actions={
          isAdminOrExecutive && (
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={16} /> New account
            </button>
          )
        }
      />

      {closedCount > 0 && (
        <button className="mb-4 text-sm text-ink-500 underline" onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? 'Hide' : 'Show'} {closedCount} closed account{closedCount === 1 ? '' : 's'}
        </button>
      )}

      {isLoading ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <EmptyState title="No accounts yet." />
      ) : (
        <div className="space-y-4">
          {accounts.map((a) => {
            const theirs = projects.filter((p) => p.account_id === a.id)
            const link = links.find((l) => l.account_id === a.id)
            const totalHours = theirs.reduce((s, p) => s + p.total_hours, 0)
            const totalAccrued = theirs.reduce((s, p) => s + (p.accrued_amount ?? 0), 0)
            const totalBudget = theirs.reduce((s, p) => s + p.budget_amount, 0)

            return (
              <div key={a.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-ink-900">{a.name}</p>
                      {a.status === 'closed' && <span className="chip bg-cream-200 text-ink-500">Closed</span>}
                    </div>
                    <p className="text-sm text-ink-500">
                      {a.primary_contact_name ?? 'No contact'}
                      {a.primary_contact_email ? ` · ${a.primary_contact_email}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {hasFinancialAccess && (
                      <span className="text-sm text-ink-500">
                        {hours(totalHours)} · {money(totalAccrued)} of {money(totalBudget)}
                      </span>
                    )}
                    {isAdminOrExecutive && (
                      <button className="btn-ghost" onClick={() => setEditing(a)}>
                        <Pencil size={15} /> Edit
                      </button>
                    )}
                    {link ? (
                      <>
                        <button className="btn-ghost" onClick={() => void copy(link.token)}>
                          {copied === link.token ? <Check size={15} /> : <Copy size={15} />}
                          {copied === link.token ? 'Copied' : 'Copy client link'}
                        </button>
                        <a className="btn-ghost" href={portalUrl(link.token)} target="_blank" rel="noreferrer">
                          <ExternalLink size={15} /> Open
                        </a>
                      </>
                    ) : (
                      isAdminOrExecutive && (
                        <button
                          className="btn-primary"
                          disabled={createLink.isPending}
                          onClick={() => createLink.mutate(a.id)}
                        >
                          <Link2 size={15} /> Create client link
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {theirs.map((p) => (
                    <Link
                      key={p.project_id}
                      to={`/projects/${p.project_id}`}
                      className="rounded-xl border border-cream-300 p-3 hover:border-brand-300"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium text-ink-900">{p.name}</p>
                        <span className={`chip shrink-0 ${PROJECT_STATUS_CLASS[p.status]}`}>
                          {PROJECT_STATUS_LABEL[p.status]}
                        </span>
                      </div>
                      <div className="mt-2.5">
                        <BurnBar percent={p.pct_amount} />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showNew && <NewAccountModal orgId={profile!.org_id} onClose={() => setShowNew(false)} />}
      {editing && <EditAccountModal account={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function NewAccountModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const create = useCreateAccount()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [status, setStatus] = useState<AccountStatus>('prospect')

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
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="New account" icon={<Building2 size={16} className="text-brand-600" />} onClose={onClose} />
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" />
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
      </div>
    </Modal>
  )
}

function EditAccountModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const update = useUpdateAccount()
  const archive = useArchiveAccount()
  const [name, setName] = useState(account.name)
  const [code, setCode] = useState(account.code ?? '')
  const [contactName, setContactName] = useState(account.primary_contact_name ?? '')
  const [contactEmail, setContactEmail] = useState(account.primary_contact_email ?? '')
  const [status, setStatus] = useState<AccountStatus>(account.status)
  const [done, setDone] = useState(false)

  async function submit() {
    await update.mutateAsync({
      id: account.id,
      patch: {
        name: name.trim(),
        code: code.trim() || null,
        primary_contact_name: contactName.trim() || null,
        primary_contact_email: contactEmail.trim() || null,
        status,
      },
    })
    setDone(true)
    window.setTimeout(onClose, 1200)
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function del() {
    setConfirmingDelete(false)
    archive.mutate(account.id, { onSuccess: onClose })
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Edit account" icon={<Pencil size={16} className="text-brand-600" />} onClose={onClose} />
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
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
          disabled={!name.trim() || update.isPending}
          onClick={() => void submit()}
        >
          <Check size={16} /> Save changes
        </button>
        {done && <p className="text-sm text-brand-700">Account updated.</p>}

        <div className="border-t border-cream-300 pt-3">
          <button className="btn-danger w-full" disabled={archive.isPending} onClick={() => setConfirmingDelete(true)}>
            <Trash2 size={16} /> Delete account
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${account.name}"?`}
          message="This closes the account and archives all its projects. Logged hours, invoices, and payment history are kept, and this can be undone by editing the statuses back."
          busy={archive.isPending}
          onConfirm={del}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </Modal>
  )
}
