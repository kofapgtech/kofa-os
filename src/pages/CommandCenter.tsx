import { useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AlertTriangle, FileClock, TrendingUp, Wallet } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '@/contexts/AuthContext'
import {
  useDeliverables,
  useDepartmentLoad,
  useProfiles,
  useProjectBudgets,
  useUtilization,
} from '@/lib/queries'
import { BurnBar, PageHeader, Spinner, StatCard } from '@/components/ui'
import { STAGE_CLASS, STAGE_LABEL, hours, money, shortDate } from '@/lib/format'

export function CommandCenter() {
  const { isLeadership } = useAuth()
  const { data: projects = [], isLoading } = useProjectBudgets()
  const { data: departments = [] } = useDepartmentLoad()
  const { data: utilization = [] } = useUtilization()
  const { data: deliverables = [] } = useDeliverables()
  const { data: people = [] } = useProfiles()

  const active = useMemo(
    () => projects.filter((p) => p.status === 'active' || p.status === 'planning'),
    [projects],
  )

  const atRisk = active.filter((p) => (p.pct_amount ?? 0) >= 90)
  const totalBudget = active.reduce((s, p) => s + p.budget_amount, 0)
  const totalAccrued = active.reduce((s, p) => s + (p.accrued_amount ?? 0), 0)
  const inReview = deliverables.filter(
    (d) => d.stage === 'internal_review' || d.stage === 'client_review',
  )

  // Last 8 weeks of agency-wide utilization.
  const utilTrend = useMemo(() => {
    const byWeek = new Map<string, { hours: number; capacity: number }>()
    utilization.forEach((u) => {
      const row = byWeek.get(u.week_start) ?? { hours: 0, capacity: 0 }
      row.hours += Number(u.hours)
      row.capacity += Number(u.capacity_hours_per_week)
      byWeek.set(u.week_start, row)
    })
    return [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([week, r]) => ({
        week: shortDate(week),
        utilization: r.capacity ? Math.round((r.hours / r.capacity) * 100) : 0,
      }))
  }, [utilization])

  const perPerson = useMemo(() => {
    const latestWeek = [...new Set(utilization.map((u) => u.week_start))].sort().pop()
    return utilization
      .filter((u) => u.week_start === latestWeek)
      .map((u) => ({
        name: u.full_name.split(' ')[0],
        pct: Math.round(Number(u.utilization_pct ?? 0)),
      }))
      .sort((a, b) => b.pct - a.pct)
  }, [utilization])

  if (!isLeadership) return <Navigate to="/" replace />
  if (isLoading) return <Spinner />

  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.full_name ?? '—'

  return (
    <div>
      <PageHeader
        title="Command centre"
        subtitle="Capacity, budget health, and what is stuck — across all six departments."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active budget"
          value={money(totalBudget)}
          sub={`${money(totalAccrued)} consumed · ${Math.round((totalAccrued / (totalBudget || 1)) * 100)}%`}
          icon={<Wallet size={16} />}
        />
        <StatCard
          label="Projects at risk"
          value={atRisk.length}
          tone={atRisk.length ? 'text-rose-600' : 'text-slate-900'}
          sub="Over 90% of budget consumed"
          icon={<AlertTriangle size={16} />}
        />
        <StatCard
          label="Awaiting review"
          value={inReview.length}
          sub="Deliverables sitting in a review stage"
          icon={<FileClock size={16} />}
        />
        <StatCard
          label="Utilization this week"
          value={`${utilTrend.at(-1)?.utilization ?? 0}%`}
          sub="Logged hours against capacity"
          icon={<TrendingUp size={16} />}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">Utilization trend</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={utilTrend} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v) => [`${v}%`, 'Utilization']}
                />
                <Line type="monotone" dataKey="utilization" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">Utilization by person, this week</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perPerson} margin={{ top: 5, right: 8, left: -20, bottom: 18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                {/* interval=0 so every name renders instead of being dropped for overlap */}
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v) => [`${v}%`, 'Utilization']}
                />
                <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                  {perPerson.map((p) => (
                    <Cell
                      key={p.name}
                      fill={p.pct > 100 ? '#f43f5e' : p.pct >= 70 ? '#10b981' : '#94a3b8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mb-4 card overflow-hidden">
        <p className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
          Budget health by project
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">Project</th>
                <th className="th">Department</th>
                <th className="th">Lead</th>
                <th className="th w-52">Burn</th>
                <th className="th text-right">Spent</th>
                <th className="th text-right">Budget</th>
                <th className="th text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {active.map((p) => (
                <tr key={p.project_id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link className="font-medium text-slate-900 hover:text-brand-700" to={`/projects/${p.project_id}`}>
                      {p.name}
                    </Link>
                    <span className="block text-xs text-slate-500">{p.account_name}</span>
                  </td>
                  <td className="td">{p.department_name ?? '—'}</td>
                  <td className="td">{nameOf(p.lead_id)}</td>
                  <td className="td">
                    <BurnBar percent={p.pct_amount} showLabel={false} />
                  </td>
                  <td className="td text-right tabular-nums">{money(p.accrued_amount)}</td>
                  <td className="td text-right tabular-nums">{money(p.budget_amount)}</td>
                  <td className="td text-right tabular-nums">
                    {p.margin_pct !== null ? `${p.margin_pct}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">Department load</p>
          <div className="space-y-2">
            {departments.map((d) => (
              <div key={d.department_id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{d.name}</p>
                  <p className="text-xs text-slate-500">
                    {d.active_projects} projects · {d.open_tasks} open tasks
                    {d.overdue_tasks > 0 && (
                      <span className="text-rose-600"> · {d.overdue_tasks} overdue</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{hours(d.hours_this_week)}</p>
                  <p className="text-xs text-slate-500">this week</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">Stuck in review</p>
          {inReview.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing waiting.</p>
          ) : (
            <div className="space-y-2">
              {inReview.map((d) => (
                <Link
                  key={d.id}
                  to="/deliverables"
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{d.title}</span>
                    <span className="block text-xs text-slate-500">
                      {nameOf(d.reviewer_id)} · due {shortDate(d.due_date)}
                    </span>
                  </span>
                  <span className={`chip shrink-0 ${STAGE_CLASS[d.stage]}`}>{STAGE_LABEL[d.stage]}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
