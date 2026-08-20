import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useDepartments, useProjectBudgets } from '@/lib/queries'
import { BurnBar, EmptyState, PageHeader, Spinner } from '@/components/ui'
import {
  PROJECT_STATUS_CLASS,
  PROJECT_STATUS_LABEL,
  hours,
  money,
  shortDate,
} from '@/lib/format'

export function Projects() {
  const { hasFinancialAccess } = useAuth()
  const { data: projects = [], isLoading } = useProjectBudgets()
  const { data: departments = [] } = useDepartments()
  const [dept, setDept] = useState('all')
  const [status, setStatus] = useState('active')

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
          </>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState title="No projects match these filters." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <Link key={p.project_id} to={`/projects/${p.project_id}`} className="card p-4 hover:border-brand-300">
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
          ))}
        </div>
      )}
    </div>
  )
}
