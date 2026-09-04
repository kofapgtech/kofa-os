import { useMemo, useState } from 'react'
import { Check, Package, Plus, RotateCcw, X } from 'lucide-react'
import type { Deliverable, DeliverableFeeAllocation, Profile, Task } from '@/lib/types'
import { money, shortDate } from '@/lib/format'
import {
  useAcceptDeliverable,
  useCreateDeliverable,
  useDeleteDeliverableFeeAllocation,
  useDeliverableFeesFor,
  useDeliverables,
  useProjectBudgets,
  useRequestWorkstreamBudget,
  useSetDeliverableFeeAllocation,
  useUnacceptDeliverable,
  useWorkstreamBudgets,
} from '@/lib/queries'
import { useAuth } from '@/contexts/AuthContext'

export function addMonths(monthStr: string, n: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

export function monthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function currentMonthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

/** The deliverable-tracked twin of HourAllocationsSection.
 *
 *  On a task whose tracking_mode is 'deliverable', money is committed as a flat
 *  fee per deliverable rather than as hours x cost_rate, and it is split across
 *  the people who earn it — one deliverable_fee_allocations row each, carrying
 *  its own budget month so it draws on the right month of the workstream's
 *  budget (exactly the shape task_hour_allocations uses).
 *
 *  Two separate gates matter here and are easy to conflate:
 *    - Allocating a fee is what ASSIGNS someone to the task (a DB trigger
 *      writes task_assignees), so it is lead/MD/admin-only, same as hours.
 *    - Accepting a deliverable is what EARNS the fee. It is the workstream
 *      lead's call, is refused for anyone allocated a share of that same fee,
 *      and is what opens the timesheet week the money is paid in.
 *
 *  Once accepted, the fee rows are frozen server-side — withdrawing acceptance
 *  is the only way back, and that itself is refused once the week has cleared
 *  approval or been paid. */
export function TaskDeliverablesSection({
  task,
  people,
  locked,
}: {
  task: Task
  people: Profile[]
  locked?: boolean
}) {
  const { profile, isLeadership } = useAuth()
  const { data: allDeliverables = [] } = useDeliverables(task.project_id)
  const { data: projectBudgets = [] } = useProjectBudgets()
  const createDeliverable = useCreateDeliverable()
  const setFee = useSetDeliverableFeeAllocation()
  const deleteFee = useDeleteDeliverableFeeAllocation()
  const accept = useAcceptDeliverable()
  const unaccept = useUnacceptDeliverable()
  const requestBudget = useRequestWorkstreamBudget()

  const [month, setMonth] = useState(currentMonthStart)
  const { data: workstreamBudgets = [] } = useWorkstreamBudgets(task.project_id, month)
  const wb = workstreamBudgets.find((w) => w.department_id === task.department_id)

  const deliverables = useMemo(
    () => allDeliverables.filter((d) => d.task_id === task.id),
    [allDeliverables, task.id],
  )
  const deliverableIds = useMemo(() => deliverables.map((d) => d.id), [deliverables])
  const { data: fees = [] } = useDeliverableFeesFor(deliverableIds)

  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [adding, setAdding] = useState(false)
  const [requestForm, setRequestForm] = useState<{ amount: string; reason: string } | null>(null)

  // budget_amount lives on `projects`, not the money-gated cost tables, so an
  // untracked project (internal account) reads null for everyone. Undefined
  // while in flight, which correctly leaves the budget check ON until known.
  const projectRow = projectBudgets.find((b) => b.project_id === task.project_id)
  const isUntracked = projectRow ? projectRow.budget_amount === null : false

  const nameFor = (id: string) => people.find((p) => p.user_id === id)?.full_name ?? 'Unknown'
  const workstreamMembers = people.filter((p) => p.department_id === task.department_id)

  const feesFor = (deliverableId: string) => fees.filter((f) => f.deliverable_id === deliverableId)
  const totalFor = (deliverableId: string) =>
    feesFor(deliverableId).reduce((sum, f) => sum + Number(f.amount), 0)

  const acceptedCount = deliverables.filter((d) => d.accepted_at).length
  const committedThisMonth = fees
    .filter((f) => f.budget_month === month)
    .reduce((sum, f) => sum + Number(f.amount), 0)
  const earnedTotal = deliverables
    .filter((d) => d.accepted_at)
    .reduce((sum, d) => sum + totalFor(d.id), 0)

  if (!task.department_id) {
    return (
      <div className="mt-4 rounded-xl border border-cream-300 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <Package size={14} /> Deliverables
        </p>
        <p className="mt-1 text-sm text-ink-500">
          Assign this task to a workstream before setting deliverable fees against it.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-cream-300 p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <Package size={14} /> Deliverables
        </p>
        <div className="flex items-center gap-1.5 text-xs">
          <button className="btn-ghost !min-h-0 !py-1 !px-2" onClick={() => setMonth((m) => addMonths(m, -1))}>
            ←
          </button>
          <span className="font-medium text-ink-700">{monthLabel(month)}</span>
          <button className="btn-ghost !min-h-0 !py-1 !px-2" onClick={() => setMonth((m) => addMonths(m, 1))}>
            →
          </button>
        </div>
      </div>

      <p className="mt-1 text-xs text-ink-500">
        {deliverables.length === 0
          ? 'No deliverables yet — this task earns nothing until one is added and priced.'
          : `${acceptedCount} of ${deliverables.length} accepted · ${money(earnedTotal)} earned`}
      </p>
      <p className="mt-0.5 text-xs text-ink-500">
        {isUntracked
          ? `${money(committedThisMonth)} committed for ${monthLabel(month)} — no budget to draw against.`
          : wb
            ? `${wb.department_name} · ${money(wb.committed_amount)} committed of ${money(wb.allocated_amount)} allocated · ${money(wb.remaining_amount)} remaining`
            : `No workstream budget allocated for ${monthLabel(month)} yet.`}
      </p>

      <div className="mt-2 space-y-2">
        {deliverables.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing here yet.</p>
        ) : (
          deliverables.map((d) => (
            <DeliverableFeeRow
              key={d.id}
              deliverable={d}
              task={task}
              fees={feesFor(d.id)}
              total={totalFor(d.id)}
              month={month}
              members={workstreamMembers}
              nameFor={nameFor}
              canEdit={!!isLeadership && !locked}
              remaining={wb?.remaining_amount ?? 0}
              skipBudgetCheck={isUntracked}
              myUserId={profile?.user_id ?? ''}
              onSetFee={(profileId, amount) =>
                setFee.mutate({
                  deliverable_id: d.id,
                  profile_id: profileId,
                  department_id: task.department_id!,
                  budget_month: month,
                  amount,
                  org_id: task.org_id,
                  created_by: profile!.user_id,
                })
              }
              onDeleteFee={(id) => deleteFee.mutate(id)}
              onAccept={() => accept.mutate({ id: d.id })}
              onUnaccept={() => unaccept.mutate({ id: d.id })}
              onOverBudget={(shortfall, who, amount) =>
                setRequestForm({
                  amount: shortfall.toFixed(2),
                  reason: `${who} — ${money(amount)} on "${d.title}"`,
                })
              }
            />
          ))
        )}
      </div>

      {!locked && (
        <>
          {adding ? (
            <div className="mt-2 space-y-2 rounded-lg border border-cream-300 bg-cream-50 p-2.5">
              <input
                className="input"
                placeholder="What is being delivered?"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
              <div>
                <label className="label">Due date</label>
                <input className="input" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-ghost text-xs"
                  onClick={() => {
                    setAdding(false)
                    setNewTitle('')
                    setNewDue('')
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary text-xs"
                  disabled={!newTitle.trim() || createDeliverable.isPending}
                  onClick={async () => {
                    await createDeliverable.mutateAsync({
                      org_id: task.org_id,
                      project_id: task.project_id,
                      task_id: task.id,
                      title: newTitle.trim(),
                      due_date: newDue || task.due_date,
                      // Owner defaults to the creator so the deliverables_update
                      // RLS (owner / reviewer / lead) doesn't lock them out of
                      // the thing they just made.
                      owner_id: profile!.user_id,
                    })
                    setAdding(false)
                    setNewTitle('')
                    setNewDue('')
                  }}
                >
                  <Plus size={13} /> Add deliverable
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-ghost !min-h-0 !py-1 !px-2 mt-2 text-xs" onClick={() => setAdding(true)}>
              <Plus size={13} /> Add deliverable
            </button>
          )}
        </>
      )}

      {isLeadership && !locked && requestForm && (
        <div className="mt-2 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
          <p className="text-xs font-semibold text-amber-800">
            That fee exceeds the remaining {wb?.department_name ?? 'workstream'} budget for {monthLabel(month)}. The
            fee was still committed — ask the executive for more room.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={requestForm.amount}
              onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
            />
            <input
              className="input"
              placeholder="Reason"
              value={requestForm.reason}
              onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={() => setRequestForm(null)}>
              Dismiss
            </button>
            <button
              className="btn-primary text-xs"
              disabled={!requestForm.amount || Number(requestForm.amount) <= 0 || requestBudget.isPending}
              onClick={async () => {
                await requestBudget.mutateAsync({
                  projectId: task.project_id,
                  month,
                  departmentId: task.department_id!,
                  amount: Number(requestForm.amount),
                  reason: requestForm.reason || undefined,
                })
                setRequestForm(null)
              }}
            >
              Submit request
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DeliverableFeeRow({
  deliverable,
  task,
  fees,
  total,
  month,
  members,
  nameFor,
  canEdit,
  remaining,
  skipBudgetCheck,
  myUserId,
  onSetFee,
  onDeleteFee,
  onAccept,
  onUnaccept,
  onOverBudget,
}: {
  deliverable: Deliverable
  task: Task
  fees: DeliverableFeeAllocation[]
  total: number
  month: string
  members: Profile[]
  nameFor: (id: string) => string
  canEdit: boolean
  remaining: number
  skipBudgetCheck: boolean
  myUserId: string
  onSetFee: (profileId: string, amount: number) => void
  onDeleteFee: (id: string) => void
  onAccept: () => void
  onUnaccept: () => void
  onOverBudget: (shortfall: number, who: string, amount: number) => void
}) {
  const [draftProfileId, setDraftProfileId] = useState('')
  const [draftAmount, setDraftAmount] = useState('')
  const accepted = !!deliverable.accepted_at
  // The lead who stands to be paid out of this same fee can't be the one who
  // signs it off — the DB refuses it too, this just hides a button that would
  // always fail.
  const iAmPaid = fees.some((f) => f.profile_id === myUserId)
  const monthFees = fees.filter((f) => f.budget_month === month)

  function tryAdd() {
    if (!draftProfileId || !draftAmount) return
    const amount = Number(draftAmount)
    if (amount <= 0) return
    onSetFee(draftProfileId, amount)
    if (!skipBudgetCheck && amount > remaining + 0.005) {
      onOverBudget(amount - remaining, nameFor(draftProfileId), amount)
    }
    setDraftProfileId('')
    setDraftAmount('')
  }

  return (
    <div className="rounded-lg border border-cream-300 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[7rem] flex-1 text-sm font-medium text-ink-900">{deliverable.title}</span>
        {accepted ? (
          <span className="chip bg-emerald-100 text-emerald-800">
            <Check size={11} /> Accepted
          </span>
        ) : (
          <span className="chip bg-cream-200 text-ink-600">Not accepted</span>
        )}
        <span className="tabular-nums text-sm font-semibold">{money(total)}</span>
      </div>
      {deliverable.due_date && (
        <p className="mt-0.5 text-xs text-ink-500">Due {shortDate(deliverable.due_date)}</p>
      )}

      <div className="mt-1.5 space-y-1">
        {monthFees.length === 0 ? (
          <p className="text-xs text-ink-500">
            {fees.length === 0
              ? 'No fee set — nobody earns anything from this yet.'
              : `Nothing for ${monthLabel(month)}; this deliverable's fee sits in another month.`}
          </p>
        ) : (
          monthFees.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[6rem] flex-1 text-xs text-ink-700">{nameFor(f.profile_id)}</span>
              {canEdit && !accepted ? (
                <input
                  className="input !w-24 !py-1 text-right text-xs"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={f.amount}
                  onBlur={(e) => {
                    const v = Number(e.target.value)
                    if (v > 0 && v !== Number(f.amount)) onSetFee(f.profile_id, v)
                    else if (v <= 0) onDeleteFee(f.id)
                  }}
                />
              ) : (
                <span className="tabular-nums text-xs">{money(Number(f.amount))}</span>
              )}
              {canEdit && !accepted && (
                <button className="btn-ghost !min-h-0 !py-0.5 !px-1.5" onClick={() => onDeleteFee(f.id)}>
                  <X size={12} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {canEdit && !accepted && (
        <div className="mt-1.5 flex flex-wrap items-end gap-2">
          {members.length === 0 ? (
            <p className="text-xs text-ink-500">No one in this workstream yet.</p>
          ) : (
            <>
              <div className="min-w-[8rem] flex-1">
                <select
                  className="input !py-1 text-xs"
                  value={draftProfileId}
                  onChange={(e) => setDraftProfileId(e.target.value)}
                >
                  <option value="">Who earns this…</option>
                  {members.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <input
                className="input !w-24 !py-1 text-xs"
                type="number"
                min="0"
                step="0.01"
                placeholder="Fee"
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
              />
              <button
                className="btn-ghost !min-h-0 !py-1 !px-2 text-xs"
                onClick={tryAdd}
                disabled={!draftProfileId || !draftAmount}
              >
                <Plus size={12} /> Split
              </button>
            </>
          )}
        </div>
      )}

      {canEdit && task.tracking_mode === 'deliverable' && (
        <div className="mt-2 flex gap-2">
          {accepted ? (
            <button className="btn-ghost !min-h-0 !py-1 !px-2 text-xs" onClick={onUnaccept}>
              <RotateCcw size={12} /> Withdraw acceptance
            </button>
          ) : (
            <button
              className="btn-primary !min-h-0 !py-1 !px-2 text-xs"
              onClick={onAccept}
              disabled={fees.length === 0 || iAmPaid}
              title={
                fees.length === 0
                  ? 'Set the fee first'
                  : iAmPaid
                    ? "You're being paid for this one — another lead has to accept it"
                    : undefined
              }
            >
              <Check size={12} /> Accept & release fee
            </button>
          )}
        </div>
      )}
    </div>
  )
}
