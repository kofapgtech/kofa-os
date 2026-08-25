import { useState, type ChangeEvent, type ReactNode } from 'react'
import { Check, Paperclip, UserPlus, Users2, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useAllProfiles,
  useDepartments,
  useInviteEmployee,
  useProfileRates,
  useUpdateCostRate,
  useUpdateProfile,
} from '@/lib/queries'
import { EmptyState, Modal, ModalHeader, PageHeader, Spinner } from '@/components/ui'
import type { Department, EmploymentType, Profile, ProfileRate, UserRole } from '@/lib/types'

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
            only. Only a true admin can invite an admin/executive/billing/HR
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
  const { data: departments = [] } = useDepartments()
  const invite = useInviteEmployee()

  // HR sees the same form, just capped to non-privileged roles - the server
  // (RLS + the Edge Function) enforces this independently either way.
  const assignableRoles = isAdmin ? ALL_ROLES : HR_ASSIGNABLE_ROLES

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('staff')
  const [employmentType, setEmploymentType] = useState<EmploymentType>('employee')
  const [departmentId, setDepartmentId] = useState('')
  const [title, setTitle] = useState('')
  const [capacity, setCapacity] = useState('40')

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
    onClose()
  }

  const canSubmit = !!fullName.trim() && !!email.trim()

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
        <button
          className="btn-primary w-full"
          disabled={!canSubmit || invite.isPending}
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
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const dept = departments.find((d) => d.id === p.department_id)
                return (
                  <tr
                    key={p.id}
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
          rate={rates.find((r) => r.profile_id === editing.id) ?? null}
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
  const update = useUpdateProfile()
  const updateRate = useUpdateCostRate()
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
        id: person.id,
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
          profileId: person.id,
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
      id: person.id,
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

      {tab === 'attachments' && showExtraTabs && <AttachmentsTab />}

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
 * Shell only — files live in local state and vanish when the modal closes.
 * Real persistence (Supabase Storage bucket + a metadata table) is a
 * follow-up; this establishes the tab's shape first.
 */
function AttachmentsTab() {
  const [files, setFiles] = useState<{ name: string; size: number; addedAt: string }[]>([])

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files
    if (!picked || picked.length === 0) return
    const next = Array.from(picked).map((f) => ({ name: f.name, size: f.size, addedAt: new Date().toISOString() }))
    setFiles((cur) => [...cur, ...next])
    e.target.value = ''
  }

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-accent-100 px-3 py-2 text-xs text-accent-700">
        Not yet saved permanently — this list resets when the modal closes. Storage wiring is coming in a follow-up.
      </p>
      <label className="btn-ghost w-full cursor-pointer justify-center">
        <Paperclip size={15} /> Add file
        <input type="file" multiple className="hidden" onChange={onPick} />
      </label>
      {files.length === 0 ? (
        <p className="text-sm text-ink-500">No attachments added.</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg border border-cream-300 px-3 py-2 text-sm"
            >
              <span className="truncate text-ink-900">{f.name}</span>
              <span className="ml-2 flex shrink-0 items-center gap-2 text-xs text-ink-500">
                {(f.size / 1024).toFixed(0)} KB
                <button
                  className="text-ink-400 hover:text-rose-600"
                  onClick={() => setFiles((cur) => cur.filter((_, idx) => idx !== i))}
                >
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
