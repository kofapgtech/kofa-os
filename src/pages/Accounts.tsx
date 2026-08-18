import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useAccounts, useCreateShareLink, useProjectBudgets, useShareLinks } from '@/lib/queries'
import { BurnBar, EmptyState, PageHeader, Spinner } from '@/components/ui'
import { PROJECT_STATUS_CLASS, PROJECT_STATUS_LABEL, hours, money } from '@/lib/format'

export function Accounts() {
  const { isAdmin, isLeadership } = useAuth()
  const { data: accounts = [], isLoading } = useAccounts()
  const { data: projects = [] } = useProjectBudgets()
  const { data: links = [] } = useShareLinks()
  const createLink = useCreateShareLink()
  const [copied, setCopied] = useState<string | null>(null)

  function portalUrl(token: string) {
    return `${window.location.origin}/portal/${token}`
  }

  async function copy(token: string) {
    await navigator.clipboard.writeText(portalUrl(token))
    setCopied(token)
    window.setTimeout(() => setCopied(null), 2000)
  }

  if (isLoading) return <Spinner />
  if (accounts.length === 0) return <EmptyState title="No accounts yet." />

  return (
    <div>
      <PageHeader title="Accounts" subtitle="Clients, their work, and their read-only portal links." />

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
                  <p className="text-base font-semibold text-ink-900">{a.name}</p>
                  <p className="text-sm text-ink-500">
                    {a.primary_contact_name ?? 'No contact'}
                    {a.primary_contact_email ? ` · ${a.primary_contact_email}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isLeadership && (
                    <span className="text-sm text-ink-500">
                      {hours(totalHours)} · {money(totalAccrued)} of {money(totalBudget)}
                    </span>
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
                    isAdmin && (
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
                      <BurnBar percent={isLeadership ? p.pct_amount : p.pct_hours} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
