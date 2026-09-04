import { useState, type ChangeEvent, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Check, ChevronDown, Paperclip, Star, UserMinus, UserPlus, Users2, X } from 'lucide-react'
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
const HR_ASSIGNABLE_ROLES: UserRole[] = ['staff', 'dept_lead']
const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  executive: 'Executive',
  dept_lead: 'Department lead',
  hr_manager: 'HR',
  staff: 'Staff',
}
const EMPLOYMENT_TYPES: EmploymentType[] = ['employee', 'contractor']
const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = { employee: 'Employee', contractor: 'Contractor' }

export function AdminEmployees() {
  const { isAdmin, isAdminOrExecutive, isHR } = useAuth()

  if (!isAdminOrExecutive && !isHR) {
    return <EmptyState title="No admin access" hint="Ask an admin for access to this page." />
  }

  return (
    <div>
      <PageHeader title="Employees" subtitle="Invite employees and manage the roster." />
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Executive deliberately excluded from inviting - that stays admin/HR
            only. Only a true admin can invite an admin/executive/HR
            peer; HR's invite rights are capped to staff/dept_lead, enforced
            again server-side since this card can't be trusted to be the only
            gate. */}
        {(isAdmin || isHR) && <QuickActionsCard isAdmin={isAdmin} />}
        <div className="xl:col-span-2">
          <EmployeesCard isAdmin={isAdmin} isHR={isHR} />
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

function QuickActionsCard({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <Section title="Quick actions" icon={<UserPlus size={16} className="text-brand-600" />}>
      <button className="btn-primary w-full" onClick={() => setOpen(true)}>
        <UserPlus size={16} /> Invite employee
      </button>
      {open && <InviteEmployeeModal isAdmin={isAdmin} onClose={() => setOpen(false)} />}
    </Section>
  )
}

function InviteEmployeeModal({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const { profile: viewer } = useAuth()
  const { data: departments = [] } = useDepartments()
  const invite = useInviteEmployee()
  const updateRate = useUpdateCostRate()
  const addWorkstreamMember = useAddWorkstreamMember()

  // HR sees the same form, just capped to non-privileged roles - the server
  // (RLS + the Edge Function) enforces this independently either way.
  const assignableRoles = isAdmin ? ALL_ROLES : HR_ASSIGNABLE_ROLES

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
  const [workstreamOpen, setWorkstreamOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [capacity, setCapacity] = useState('40')
  const [payRate, setPayRate] = useState('')

  function toggleWorkstream(id: string) {
    setWorkstreamIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id)
        setPrimaryWorkstreamId((p) => (p === id ? next[0] ?? '' : p))
        return next
      }
      setPrimaryWorkstreamId((p) => p || id)
      return [...prev, id]
    })
  }

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
          <div className="relative">
            <label className="label">Workstream</label>
            <button
              type="button"
              className="input flex items-center justify-between gap-2 text-left"
              onClick={() => setWorkstreamOpen((v) => !v)}
            >
              {workstreamIds.length === 0 ? (
                <span className="text-ink-400">Select workstream(s)…</span>
              ) : (
                <span className="truncate">
                  {departments
                    .filter((d) => workstreamIds.includes(d.id))
                    .map((d) => (d.id === primaryWorkstreamId ? `${d.name} (primary)` : d.name))
                    .join(', ')}
                </span>
              )}
              <ChevronDown size={15} className={`shrink-0 text-ink-400 transition-transform ${workstreamOpen ? 'rotate-180' : ''}`} />
            </button>
            {workstreamOpen && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-cream-300 bg-white p-2 shadow-lg">
                {departments.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-ink-500">No workstreams yet.</p>
                ) : (
                  departments.map((d) => {
                    const checked = workstreamIds.includes(d.id)
                    const isPrimary = primaryWorkstreamId === d.id
                    return (
                      <label
                        key={d.id}
                        className="flex items-center justify-between gap-2 rounded px-1 py-1 text-sm hover:bg-cream-100"
                      >
                        <span className="flex items-center gap-2">
                          <input type="checkbox" checked={checked} onChange={() => toggleWorkstream(d.id)} />
                          {d.name}
                        </span>
                        {checked && (
                          <button
                            type="button"
                            className={`flex shrink-0 items-center gap-1 text-xs ${
                              isPrimary ? 'font-semibold text-brand-700' : 'text-ink-400 hover:text-ink-700'
                            }`}
                            title="Mark as primary workstream"
                            onClick={() => setPrimaryWorkstreamId(d.id)}
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
                  onClick={() => setWorkstreamOpen(false)}
                >
                  Done
                </button>
              </div>
            )}
            {workstreamIds.length > 1 && (
              <p className="mt-1 text-xs text-ink-500">
                The starred workstream becomes their Department; the rest are added as additional workstreams.
              </p>
            )}
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

function EmployeesCard({ isAdmin, isHR }: { isAdmin: boolean; isHR: boolean }) {
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
          isAdmin={isAdmin}
          isHR={isHR}
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
  isAdmin,
  isHR,
  onClose,
}: {
  person: Profile
  departments: Department[]
  rate: ProfileRate | null
  isAdmin: boolean
  isHR: boolean
  onClose: () => void
}) {
  const { profile: viewer } = useAuth()
  const update = useUpdateProfile()
  const updateRate = useUpdateCostRate()
  const { data: workstreamMembers = [] } = useWorkstreamMembers()
  const addWorkstreamMember = useAddWorkstreamMember()
  const removeWorkstreamMember = useRemoveWorkstreamMember()
  const [addWorkstreamId, setAddWorkstreamId] = useState('')
  const [tab, setTab] = useState<'details' | 'attachments' | 'settings'>('details')
  const [done, setDone] = useState(false)

  // HR can only reassign someone into (or edit someone already in) a
  // non-privileged role - RLS enforces the same boundary independently, this
  // just avoids offering a choice the database will reject. Attachments,
  // Settings, and the pay rate carry the same boundary, since all three can
  // affect a privileged peer HR shouldn't be able to touch at all.
  const isPrivileged = !HR_ASSIGNABLE_ROLES.includes(person.role)
  const roleOptions = isAdmin ? ALL_ROLES : isPrivileged ? [person.role] : HR_ASSIGNABLE_ROLES
  const rowLocked = !isAdmin && isPrivileged
  const showExtraTabs = (isAdmin || isHR) && !rowLocked

  // Additional workstreams: staffed here on top of (not instead of) the
  // Department field above, via the workstream_members table - lets this
  // person be assigned hours on tasks in more than one workstream. Same
  // rowLocked boundary as every other Details field: an admin can always
  // edit it, an executive/HR only on a row that isn't privileged.
  const myAdditionalWorkstreamIds = new Set(
    workstreamMembers.filter((m) => m.profile_id === person.user_id).map((m) => m.department_id),
  )
  const additionalWorkstreams = departments.filter((d) => myAdditionalWorkstreamIds.has(d.id))
  const availableWorkstreams = departments.filter(
    (d) => d.id !== person.department_id && !myAdditionalWorkstreamIds.has(d.id),
  )

  const [fullName, setFullName] = useState(person.full_name)
  const [empTitle, setEmpTitle] = useState(person.title ?? '')
  const [role, setRole] = useState<UserRole>(person.role)
  const [employmentType, setEmploymentType] = useState<EmploymentType>(person.employment_type)
  const [departmentId, setDepartmentId] = useState(person.department_id ?? '')
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
          department_id: departmentId || null,
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
                disabled={rowLocked}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={empTitle}
                disabled={rowLocked}
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
                disabled={rowLocked}
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
                disabled={rowLocked}
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
              <select
                className="input"
                value={departmentId}
                disabled={rowLocked}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Capacity (h/wk)</label>
              <input
                className="input"
                type="number"
                min="0"
                value={capacity}
                disabled={rowLocked}
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

          <div>
            <label className="label">Additional workstreams</label>
            <p className="mb-1.5 text-xs text-ink-500">
              Staffed here on top of their Department above — eligible for hour allocation on
              these workstreams' tasks too.
            </p>
            {additionalWorkstreams.length > 0 && (
              <ul className="mb-2 space-y-1">
                {additionalWorkstreams.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border border-cream-300 px-2.5 py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-1.5 text-ink-800">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </span>
                    {!rowLocked && (
                      <button
                        className="shrink-0 text-ink-400 hover:text-rose-600"
                        title="Remove from Workstream"
                        disabled={removeWorkstreamMember.isPending}
                        onClick={() =>
                          removeWorkstreamMember.mutate({ departmentId: d.id, profileId: person.user_id })
                        }
                      >
                        <UserMinus size={15} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!rowLocked && (
              <div className="flex gap-2">
                <select
                  className="input"
                  value={addWorkstreamId}
                  onChange={(e) => setAddWorkstreamId(e.target.value)}
                >
                  <option value="">Add a workstream…</option>
                  {availableWorkstreams.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-primary shrink-0"
                  disabled={!addWorkstreamId || addWorkstreamMember.isPending || !viewer}
                  onClick={() => {
                    addWorkstreamMember.mutate({
                      org_id: person.org_id,
                      department_id: addWorkstreamId,
                      profile_id: person.user_id,
                      added_by: viewer!.user_id,
                    })
                    setAddWorkstreamId('')
                  }}
                >
                  <UserPlus size={15} /> Add
                </button>
              </div>
            )}
          </div>

          {rowLocked ? (
            <p className="text-sm text-ink-500">Only an admin can edit this person.</p>
          ) : (
            <button
              className="btn-primary w-full"
              disabled={!fullName.trim() || update.isPending || updateRate.isPending}
              onClick={() => void saveDetails()}
            >
              <Check size={16} /> Save changes
            </button>
          )}
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
