import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Check, ChevronDown, Paperclip, Star, UserPlus, Users2, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useAddEmployeeAttachment,
  useAddWorkstreamMember,
  useAllProfiles,
  useDeleteEmployeeAttachment,
  useDepartments,
  useEmployeeAttachments,
  useInviteEmployee,
  useProfileRates,
  useRemoveWorkstreamMember,
  useUpdateCostRate,
  useUpdateProfile,
  useWorkstreamMembers,
} from '@/lib/queries'
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  ModalHeader,
  PageHeader,
  SortableTh,
  Spinner,
  sortRows,
  useTableSort,
} from '@/components/ui'
import type { Department, EmployeeAttachment, EmploymentType, Profile, ProfileRate, UserRole } from '@/lib/types'

const ALL_ROLES: UserRole[] = ['staff', 'dept_lead', 'hr_manager', 'executive', 'admin']
// What an HR viewer may assign to someone else — never a privileged tier,
// matching the same guard enforced server-side (RLS + the invite-employee
// Edge Function). Admin/executive viewers get the full ALL_ROLES list.
const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  executive: 'Executive',
  dept_lead: 'Department lead',
  hr_manager: 'HR',
  staff: 'Staff',
}
const EMPLOYMENT_TYPES: EmploymentType[] = ['employee', 'contractor']
const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = { employee: 'Employee', contractor: 'Contractor' }

// One control for everything workstream-related, shared by the invite form and
// the employee Details tab so both read the same way: check every workstream
// the person is staffed on, star one as primary. The starred workstream is
// their Department (profiles.department_id); every other checked workstream
// becomes a workstream_members row.
function WorkstreamPicker({
  departments,
  selectedIds,
  primaryId,
  onChange,
  label = 'Workstream',
}: {
  departments: Department[]
  selectedIds: string[]
  primaryId: string
  onChange: (selectedIds: string[], primaryId: string) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter((x) => x !== id)
      // Dropping the primary promotes whatever is left, so the person never
      // ends up staffed on workstreams with no Department.
      onChange(next, primaryId === id ? next[0] ?? '' : primaryId)
    } else {
      onChange([...selectedIds, id], primaryId || id)
    }
  }

  const selected = departments.filter((d) => selectedIds.includes(d.id))

  return (
    <div className="relative">
      <label className="label">{label}</label>
      <button
        type="button"
        className="input flex items-center justify-between gap-2 text-left"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {selected.length === 0 ? (
          <span className="text-ink-400">Select workstream(s)&hellip;</span>
        ) : (
          <span className="truncate">
            {selected.map((d) => (d.id === primaryId ? `${d.name} (primary)` : d.name)).join(', ')}
          </span>
        )}
        <ChevronDown
          size={15}
          className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-cream-300 bg-white p-2 shadow-lg">
          {departments.length === 0 ? (
            <p className="px-1 py-1 text-xs text-ink-500">No workstreams yet.</p>
          ) : (
            departments.map((d) => {
              const checked = selectedIds.includes(d.id)
              const isPrimary = primaryId === d.id
              return (
                <label
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded px-1 py-1 text-sm hover:bg-cream-100"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={checked} onChange={() => toggle(d.id)} />
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="truncate">{d.name}</span>
                  </span>
                  {checked && (
                    <button
                      type="button"
                      className={`flex shrink-0 items-center gap-1 text-xs ${
                        isPrimary ? 'font-semibold text-brand-700' : 'text-ink-400 hover:text-ink-700'
                      }`}
                      title="Mark as primary workstream"
                      onClick={() => onChange(selectedIds, d.id)}
                    >
                      <Star size={13} fill={isPrimary ? 'currentColor' : 'none'} /> Primary
                    </button>
                  )}
                </label>
              )
            })
          )}
          <button
            type="button"
            className="btn-ghost mt-1 w-full !min-h-0 !py-1 text-xs"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      )}
      {selectedIds.length > 1 && (
        <p className="mt-1 text-xs text-ink-500">
          The starred workstream becomes their Department; the rest are added as additional
          workstreams.
        </p>
      )}
    </div>
  )
}

export function AdminEmployees() {
  const { isAdminOrExecutive, isHR } = useAuth()

  if (!isAdminOrExecutive && !isHR) {
    return <EmptyState title="No admin access" hint="Ask an admin for access to this page." />
  }

  return (
    <div>
      <PageHeader helpSlug="admin-employees" title="Employees" subtitle="Invite employees and manage the roster." />
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Admin, executive and HR all administer the roster and all invite —
            the same set as is_admin_exec_or_hr() in the database, which is the
            real gate. Anyone who can reach this page can use this card. */}
        <QuickActionsCard />
        <div className="xl:col-span-2">
          <EmployeesCard />
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

function QuickActionsCard() {
  const [open, setOpen] = useState(false)

  return (
    <Section title="Quick actions" icon={<UserPlus size={16} className="text-brand-600" />}>
      <button className="btn-primary w-full" onClick={() => setOpen(true)}>
        <UserPlus size={16} /> Invite employee
      </button>
      {open && <InviteEmployeeModal onClose={() => setOpen(false)} />}
    </Section>
  )
}

function InviteEmployeeModal({ onClose }: { onClose: () => void }) {
  const { profile: viewer } = useAuth()
  const { data: departments = [] } = useDepartments()
  const invite = useInviteEmployee()
  const updateRate = useUpdateCostRate()
  const addWorkstreamMember = useAddWorkstreamMember()

  // Every role is assignable by everyone who can open this form. The server
  // (RLS + the Edge Function) enforces the same thing independently.
  const assignableRoles = ALL_ROLES

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('staff')
  const [employmentType, setEmploymentType] = useState<EmploymentType>('employee')
  // Workstream is a multiselect: everything checked here gets staffed, and
  // the one starred as primary becomes their Department (profiles.department_id,
  // set at creation via the invite Edge Function's auth metadata). Anything
  // else checked is added right after as a workstream_members row, same as
  // the "Additional workstreams" list on the employee Details tab.
  const [workstreamIds, setWorkstreamIds] = useState<string[]>([])
  const [primaryWorkstreamId, setPrimaryWorkstreamId] = useState('')
  const [title, setTitle] = useState('')
  const [capacity, setCapacity] = useState('40')
  const [payRate, setPayRate] = useState('')

  async function submit() {
    const result = await invite.mutateAsync({
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      role,
      department_id: primaryWorkstreamId || null,
      title: title.trim() || null,
      capacity_hours_per_week: capacity ? Number(capacity) : 40,
      employment_type: employmentType,
    })

    const followUps: Promise<unknown>[] = [
      updateRate.mutateAsync({
        profileId: result.id,
        orgId: viewer!.org_id,
        costRate: Number(payRate),
      }),
    ]
    for (const id of workstreamIds) {
      if (id === primaryWorkstreamId) continue
      followUps.push(
        addWorkstreamMember.mutateAsync({
          org_id: viewer!.org_id,
          department_id: id,
          profile_id: result.id,
          added_by: viewer!.user_id,
        }),
      )
    }
    await Promise.all(followUps)
    onClose()
  }

  const canSubmit = !!fullName.trim() && !!email.trim() && !!payRate.trim() && !!viewer

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Invite employee" icon={<UserPlus size={16} className="text-brand-600" />} onClose={onClose} />
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
          <WorkstreamPicker
            departments={departments}
            selectedIds={workstreamIds}
            primaryId={primaryWorkstreamId}
            onChange={(ids, primary) => {
              setWorkstreamIds(ids)
              setPrimaryWorkstreamId(primary)
            }}
          />
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
          <div>
            <label className="label">Rate ($/h)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={payRate}
              onChange={(e) => setPayRate(e.target.value)}
              placeholder="e.g. 25"
            />
          </div>
        </div>
        <button
          className="btn-primary w-full"
          disabled={!canSubmit || invite.isPending || updateRate.isPending || addWorkstreamMember.isPending}
          onClick={() => void submit()}
        >
          <UserPlus size={16} /> Send invite
        </button>
      </div>
    </Modal>
  )
}

function EmployeesCard() {
  const { data: people = [], isLoading } = useAllProfiles()
  const { data: departments = [] } = useDepartments()
  const { data: rates = [] } = useProfileRates()
  const [editing, setEditing] = useState<Profile | null>(null)
  const sort = useTableSort<
    'name' | 'title' | 'email' | 'role' | 'type' | 'department' | 'capacity' | 'status'
  >()

  const statusRank = (p: Profile) => (p.termination_date ? 2 : p.is_active ? 0 : 1)
  const sortedPeople = sortRows(people, sort.sortKey, sort.sortDir, (p, key) => {
    switch (key) {
      case 'name':
        return p.full_name.toLowerCase()
      case 'title':
        return p.title?.toLowerCase() ?? null
      case 'email':
        return p.email.toLowerCase()
      case 'role':
        return ROLE_LABEL[p.role]
      case 'type':
        return EMPLOYMENT_TYPE_LABEL[p.employment_type]
      case 'department':
        return departments.find((d) => d.id === p.department_id)?.name.toLowerCase() ?? null
      case 'capacity':
        return p.capacity_hours_per_week
      case 'status':
        return statusRank(p)
      default:
        return null
    }
  })

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
                <SortableTh label="Name" sortKey="name" sort={sort} thClassName="py-2 pr-3" />
                <SortableTh label="Title" sortKey="title" sort={sort} thClassName="py-2 pr-3" />
                <SortableTh label="Email" sortKey="email" sort={sort} thClassName="py-2 pr-3" />
                <SortableTh label="Role" sortKey="role" sort={sort} thClassName="py-2 pr-3" />
                <SortableTh label="Type" sortKey="type" sort={sort} thClassName="py-2 pr-3" />
                <SortableTh label="Department" sortKey="department" sort={sort} thClassName="py-2 pr-3" />
                <SortableTh label="Capacity" sortKey="capacity" sort={sort} thClassName="py-2 pr-3" />
                <SortableTh label="Status" sortKey="status" sort={sort} thClassName="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {sortedPeople.map((p) => {
                const dept = departments.find((d) => d.id === p.department_id)
                return (
                  <tr
                    key={p.user_id}
                    className={`cursor-pointer border-b border-cream-200 last:border-0 hover:bg-cream-100 ${p.is_active ? '' : 'opacity-50'}`}
                    onClick={() => setEditing(p)}
                  >
                    <td className="py-2 pr-3 font-medium text-ink-900">{p.full_name}</td>
                    <td className="py-2 pr-3 text-ink-700">{p.title ?? '—'}</td>
                    <td className="py-2 pr-3 text-ink-500">{p.email}</td>
                    <td className="py-2 pr-3 text-ink-700">{ROLE_LABEL[p.role]}</td>
                    <td className="py-2 pr-3 text-ink-700">{EMPLOYMENT_TYPE_LABEL[p.employment_type]}</td>
                    <td className="py-2 pr-3 text-ink-700">{dept?.name ?? 'No department'}</td>
                    <td className="py-2 pr-3 tabular-nums text-ink-700">{p.capacity_hours_per_week}h/wk</td>
                    <td className="py-2 pr-3">
                      {p.termination_date ? (
                        <span className="chip bg-rose-100 text-rose-700">Terminated</span>
                      ) : p.is_active ? (
                        <span className="chip bg-brand-100 text-brand-700">Active</span>
                      ) : (
                        <span className="chip bg-cream-200 text-ink-500">Inactive</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <EmployeeModal
          person={editing}
          departments={departments}
          rate={rates.find((r) => r.profile_id === editing.user_id) ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </Section>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-700'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function EmployeeModal({
  person,
  departments,
  rate,
  onClose,
}: {
  person: Profile
  departments: Department[]
  rate: ProfileRate | null
  onClose: () => void
}) {
  const { profile: viewer } = useAuth()
  const update = useUpdateProfile()
  const updateRate = useUpdateCostRate()
  const { data: workstreamMembers } = useWorkstreamMembers()
  const addWorkstreamMember = useAddWorkstreamMember()
  const removeWorkstreamMember = useRemoveWorkstreamMember()
  const [tab, setTab] = useState<'details' | 'attachments' | 'settings'>('details')
  const [done, setDone] = useState(false)

  // No locked rows: admin, executive and HR all administer the whole roster,
  // matching is_admin_exec_or_hr() in the database. Reaching this modal at all
  // already requires one of those three.
  const roleOptions = ALL_ROLES
  const showExtraTabs = true

  // One Workstream field, exactly like the invite form: the starred entry is
  // their Department (profiles.department_id), everything else checked is a
  // workstream_members row - staffed on top of, not instead of, the primary.
  // Both halves are staged in local state and written by Save changes, so the
  // whole Details tab commits in one go.
  const existingExtraIds = useMemo(
    () =>
      (workstreamMembers ?? [])
        .filter((m) => m.profile_id === person.user_id)
        .map((m) => m.department_id),
    [workstreamMembers, person.user_id],
  )

  const [fullName, setFullName] = useState(person.full_name)
  const [empTitle, setEmpTitle] = useState(person.title ?? '')
  const [role, setRole] = useState<UserRole>(person.role)
  const [employmentType, setEmploymentType] = useState<EmploymentType>(person.employment_type)
  const [workstreamIds, setWorkstreamIds] = useState<string[]>(
    person.department_id ? [person.department_id] : [],
  )
  const [primaryWorkstreamId, setPrimaryWorkstreamId] = useState(person.department_id ?? '')
  // workstream_members arrives from its own query, which may still be in
  // flight when the modal opens - seed the checkboxes once it lands, and only
  // once, so it never clobbers edits the user has already made.
  const seededWorkstreams = useRef(false)
  useEffect(() => {
    if (seededWorkstreams.current || !workstreamMembers) return
    seededWorkstreams.current = true
    const primary = person.department_id ?? ''
    setWorkstreamIds([
      ...(primary ? [primary] : []),
      ...existingExtraIds.filter((id) => id !== primary),
    ])
    setPrimaryWorkstreamId(primary)
  }, [workstreamMembers, existingExtraIds, person.department_id])
  const [capacity, setCapacity] = useState(String(person.capacity_hours_per_week))
  const [costRate, setCostRate] = useState(rate ? String(rate.cost_rate) : '')

  const [isActive, setIsActive] = useState(person.is_active)
  const [terminationDate, setTerminationDate] = useState(person.termination_date ?? '')
  const [terminationReason, setTerminationReason] = useState(person.termination_reason ?? '')
  const [lastDayWorked, setLastDayWorked] = useState(person.last_day_worked ?? '')
  const [rehireEligible, setRehireEligible] = useState<'' | 'yes' | 'no'>(
    person.rehire_eligible === true ? 'yes' : person.rehire_eligible === false ? 'no' : '',
  )

  function flash() {
    setDone(true)
    window.setTimeout(() => setDone(false), 1500)
  }

  async function saveDetails() {
    const tasks: Promise<unknown>[] = [
      update.mutateAsync({
        id: person.user_id,
        patch: {
          full_name: fullName.trim(),
          title: empTitle.trim() || null,
          role,
          employment_type: employmentType,
          department_id: primaryWorkstreamId || null,
          capacity_hours_per_week: capacity ? Number(capacity) : 0,
        },
      }),
    ]
    // Rate field is only rendered (and only meant to be saved) for admin/HR
    // on a row that isn't locked - same boundary as the Attachments/Settings
    // tabs, so a bare executive's Details save can't touch it.
    if (showExtraTabs) {
      tasks.push(
        updateRate.mutateAsync({
          profileId: person.user_id,
          orgId: person.org_id,
          costRate: costRate ? Number(costRate) : 0,
        }),
      )
    }
    // Reconcile the extra workstreams against what is already stored: the
    // primary one lives on the profile row, never in workstream_members.
    const desiredExtraIds = workstreamIds.filter((id) => id !== primaryWorkstreamId)
    for (const id of desiredExtraIds) {
      if (existingExtraIds.includes(id)) continue
      tasks.push(
        addWorkstreamMember.mutateAsync({
          org_id: person.org_id,
          department_id: id,
          profile_id: person.user_id,
          added_by: viewer!.user_id,
        }),
      )
    }
    for (const id of existingExtraIds) {
      if (desiredExtraIds.includes(id)) continue
      tasks.push(
        removeWorkstreamMember.mutateAsync({ departmentId: id, profileId: person.user_id }),
      )
    }
    await Promise.all(tasks)
    flash()
  }

  async function saveSettings() {
    await update.mutateAsync({
      id: person.user_id,
      patch: {
        is_active: isActive,
        termination_date: terminationDate || null,
        termination_reason: terminationReason.trim() || null,
        last_day_worked: lastDayWorked || null,
        rehire_eligible: rehireEligible === '' ? null : rehireEligible === 'yes',
      },
    })
    flash()
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <ModalHeader title={person.full_name} icon={<Users2 size={16} className="text-brand-600" />} onClose={onClose} />

      <div className="mb-4 flex gap-1 border-b border-cream-300">
        <TabButton active={tab === 'details'} onClick={() => setTab('details')}>
          Details
        </TabButton>
        {showExtraTabs && (
          <TabButton active={tab === 'attachments'} onClick={() => setTab('attachments')}>
            Attachments
          </TabButton>
        )}
        {showExtraTabs && (
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
            Settings
          </TabButton>
        )}
      </div>

      {tab === 'details' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full name</label>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={empTitle}
                onChange={(e) => setEmpTitle(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={person.email} disabled />
            </div>
            <div>
              <label className="label">Role</label>
              <select
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {roleOptions.map((r) => (
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
            <WorkstreamPicker
              departments={departments}
              selectedIds={workstreamIds}
              primaryId={primaryWorkstreamId}
              onChange={(ids, primary) => {
                setWorkstreamIds(ids)
                setPrimaryWorkstreamId(primary)
              }}
            />
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
            {showExtraTabs && (
              <div>
                <label className="label">Rate ($/h)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={costRate}
                  onChange={(e) => setCostRate(e.target.value)}
                  placeholder="e.g. 25"
                />
              </div>
            )}
          </div>

          <button
            className="btn-primary w-full"
            disabled={
              !fullName.trim() ||
              !viewer ||
              update.isPending ||
              updateRate.isPending ||
              addWorkstreamMember.isPending ||
              removeWorkstreamMember.isPending
            }
            onClick={() => void saveDetails()}
          >
            <Check size={16} /> Save changes
          </button>
          {done && <p className="text-sm text-brand-700">Saved.</p>}
        </div>
      )}

      {tab === 'attachments' && showExtraTabs && <AttachmentsTab employee={person} />}

      {tab === 'settings' && showExtraTabs && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              id="employee-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <label htmlFor="employee-active" className="text-sm text-ink-700">
              Active
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Termination date</label>
              <input
                className="input"
                type="date"
                value={terminationDate}
                onChange={(e) => {
                  setTerminationDate(e.target.value)
                  if (e.target.value) setIsActive(false)
                }}
              />
            </div>
            <div>
              <label className="label">Last day worked</label>
              <input
                className="input"
                type="date"
                value={lastDayWorked}
                onChange={(e) => setLastDayWorked(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="label">Termination reason</label>
              <input
                className="input"
                value={terminationReason}
                onChange={(e) => setTerminationReason(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="label">Rehire eligible</label>
              <select
                className="input"
                value={rehireEligible}
                onChange={(e) => setRehireEligible(e.target.value as '' | 'yes' | 'no')}
              >
                <option value="">Unknown</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
          <button className="btn-primary w-full" disabled={update.isPending} onClick={() => void saveSettings()}>
            <Check size={16} /> Save changes
          </button>
          {done && <p className="text-sm text-brand-700">Saved.</p>}
        </div>
      )}
    </Modal>
  )
}

/**
 * Real persistence: files go to the private `employee-files` storage bucket
 * (path `${org_id}/${employee_id}/${timestamp}-${filename}`), metadata rows
 * live in `employee_attachments`. Until a human runs the bucket migration
 * (`supabase/migrations/..._employee_files_bucket.sql` -- blocked from
 * running automatically, same as the avatars bucket), uploads fail with a
 * "Bucket not found" error, which is caught and surfaced as a friendlier
 * message below rather than a raw Supabase error string.
 */
function AttachmentsTab({ employee }: { employee: Profile }) {
  const { profile } = useAuth()
  const { data: attachments = [], isLoading } = useEmployeeAttachments(employee.user_id)
  const addAttachment = useAddEmployeeAttachment()
  const deleteAttachment = useDeleteEmployeeAttachment()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files
    if (!picked || picked.length === 0 || !profile) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(picked)) {
        const path = `${employee.org_id}/${employee.user_id}/${Date.now()}-${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('employee-files')
          .upload(path, file, { contentType: file.type })
        if (uploadError) throw uploadError
        await addAttachment.mutateAsync({
          org_id: employee.org_id,
          employee_id: employee.user_id,
          uploaded_by: profile.user_id,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type || null,
        })
      }
    } catch (err) {
      const message = (err as Error).message
      setError(
        message.includes('Bucket not found')
          ? "File storage isn't set up yet -- ask an admin to run the employee-files bucket migration."
          : message,
      )
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function openAttachment(a: EmployeeAttachment) {
    setError(null)
    const { data, error: signError } = await supabase.storage
      .from('employee-files')
      .createSignedUrl(a.file_path, 600)
    if (signError || !data?.signedUrl) {
      setError(signError?.message ?? "Couldn't open file")
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function confirmDelete() {
    const a = attachments.find((x) => x.id === confirmingDeleteId)
    setConfirmingDeleteId(null)
    if (!a) return
    await supabase.storage.from('employee-files').remove([a.file_path])
    deleteAttachment.mutate({ id: a.id, employeeId: employee.user_id })
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <label className="btn-ghost w-full cursor-pointer justify-center">
        <Paperclip size={15} /> {uploading ? 'Uploading...' : 'Add file'}
        <input type="file" multiple className="hidden" disabled={uploading} onChange={(e) => void onPick(e)} />
      </label>
      {isLoading ? (
        <Spinner />
      ) : attachments.length === 0 ? (
        <p className="text-sm text-ink-500">No attachments added.</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-cream-300 px-3 py-2 text-sm"
            >
              <button
                type="button"
                className="truncate text-left text-ink-900 hover:text-brand-700 hover:underline"
                onClick={() => void openAttachment(a)}
              >
                {a.file_name}
              </button>
              <span className="ml-2 flex shrink-0 items-center gap-2 text-xs text-ink-500">
                {a.file_size !== null ? `${(a.file_size / 1024).toFixed(0)} KB` : ''}
                <button className="text-ink-400 hover:text-rose-600" onClick={() => setConfirmingDeleteId(a.id)}>
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {confirmingDeleteId && (
        <ConfirmDialog
          title="Delete this attachment?"
          message="This removes the file permanently."
          busy={deleteAttachment.isPending}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirmingDeleteId(null)}
        />
      )}
    </div>
  )
}
