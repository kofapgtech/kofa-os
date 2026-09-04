import { useState, type ReactNode } from 'react'
import { Building2, Pencil, Plus, Star, Trash2, UserMinus, UserPlus, Users2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useAddDepartmentLead,
  useAddWorkstreamMember,
  useAllProfiles,
  useCreateDepartment,
  useDeleteDepartment,
  useDepartmentLeads,
  useDepartments,
  useRemoveDepartmentLead,
  useRenameDepartment,
  useRemoveWorkstreamMember,
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
import type { Department, UserRole } from '@/lib/types'

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  executive: 'Executive',
  dept_lead: 'Department lead',
  hr_manager: 'HR',
  staff: 'Staff',
}

export function AdminDepartments() {
  const { profile, canManageWorkstreams } = useAuth()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Department | null>(null)

  if (!canManageWorkstreams) {
    return <EmptyState title="No admin access" hint="Ask an admin for access to this page." />
  }

  return (
    <div>
      <PageHeader
        title="Workstreams"
        subtitle="Company-wide teams. Tasks get routed to a Workstream instead of a project's roster; its lead assigns the work from there."
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Building2 size={16} /> New Workstream
          </button>
        }
      />
      <DepartmentsCard onSelect={setSelected} />
      {creating && <NewDepartmentModal orgId={profile!.org_id} onClose={() => setCreating(false)} />}
      {selected && <DepartmentMembersModal department={selected} onClose={() => setSelected(null)} />}
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

function DepartmentsCard({ onSelect }: { onSelect: (d: Department) => void }) {
  const { data: departments = [], isLoading } = useDepartments()
  const { data: people = [] } = useAllProfiles()
  const { data: departmentLeads = [] } = useDepartmentLeads()
  const { data: workstreamMembers = [] } = useWorkstreamMembers()
  const sort = useTableSort<'name' | 'members' | 'lead'>()
  const [renaming, setRenaming] = useState<Department | null>(null)
  const [deleting, setDeleting] = useState<Department | null>(null)
  const removeDept = useDeleteDepartment()

  const rows = departments.map((d) => {
    // A workstream's members are everyone with department_id === d.id (their
    // primary/home workstream) PLUS anyone explicitly tagged via
    // workstream_members - that's how a contractor/employee gets staffed on
    // more than one workstream, since department_id can only ever point at
    // one. Dedupe in case someone's somehow both.
    const additionalMemberIds = new Set(
      workstreamMembers.filter((m) => m.department_id === d.id).map((m) => m.profile_id),
    )
    const members = [
      ...people.filter((p) => p.department_id === d.id),
      ...people.filter((p) => additionalMemberIds.has(p.user_id)),
    ].filter((p, i, arr) => arr.findIndex((x) => x.user_id === p.user_id) === i)
    // A workstream's leads are everyone with role='dept_lead' staffed in it
    // (the original, single-workstream-per-person convention), PLUS anyone
    // explicitly tagged via department_leads - that's how an admin/executive
    // gets to lead more than one workstream at once, since department_id
    // can only ever point at one. Dedupe in case someone's somehow both.
    const additionalLeadIds = new Set(
      departmentLeads.filter((dl) => dl.department_id === d.id).map((dl) => dl.profile_id),
    )
    const leads = [
      ...members.filter((p) => p.role === 'dept_lead'),
      ...people.filter((p) => additionalLeadIds.has(p.user_id)),
    ].filter((p, i, arr) => arr.findIndex((x) => x.user_id === p.user_id) === i)
    return { department: d, members, leads }
  })
  const sorted = sortRows(rows, sort.sortKey, sort.sortDir, (r, key) => {
    switch (key) {
      case 'name':
        return r.department.name.toLowerCase()
      case 'members':
        return r.members.length
      case 'lead':
        return r.leads.length ? r.leads.map((l) => l.full_name).join(', ').toLowerCase() : null
      default:
        return null
    }
  })

  return (
    <Section title="Workstreams" icon={<Building2 size={16} className="text-brand-600" />}>
      {isLoading ? (
        <Spinner />
      ) : departments.length === 0 ? (
        <EmptyState title="No workstreams yet." hint="Create one to start routing tasks to it." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <SortableTh label="Name" sortKey="name" sort={sort} thClassName="py-2 pr-3" />
                <SortableTh label="Members" sortKey="members" sort={sort} thClassName="py-2 pr-3" />
                <SortableTh label="Lead" sortKey="lead" sort={sort} thClassName="py-2 pr-3" />
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ department: d, members, leads }) => {
                return (
                  <tr
                    key={d.id}
                    className="cursor-pointer border-b border-cream-200 last:border-0 hover:bg-cream-100"
                    onClick={() => onSelect(d)}
                  >
                    <td className="py-2 pr-3 font-medium text-ink-900">{d.name}</td>
                    <td className="py-2 pr-3 tabular-nums text-ink-700">{members.length}</td>
                    <td className="py-2 pr-3 text-ink-700">
                      {leads.length ? leads.map((l) => l.full_name).join(', ') : '—'}
                    </td>
                    {/* The row itself opens the members modal, so every control
                        in here has to stop the click from bubbling up to it. */}
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        className="rounded-lg p-1.5 text-ink-500 hover:bg-cream-200 hover:text-ink-900"
                        title="Rename workstream"
                        aria-label={`Rename ${d.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenaming(d)
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="rounded-lg p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-600"
                        title="Delete workstream"
                        aria-label={`Delete ${d.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleting(d)
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {renaming && <RenameDepartmentModal department={renaming} onClose={() => setRenaming(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          message="Its members are detached and any additional-lead tags go with it. A workstream that still carries tasks, budgets, budget requests or timesheet weeks can't be deleted — move those first."
          busy={removeDept.isPending}
          onConfirm={() =>
            removeDept.mutate(deleting.id, {
              onSuccess: () => setDeleting(null),
              onError: () => setDeleting(null),
            })
          }
          onCancel={() => setDeleting(null)}
        />
      )}
    </Section>
  )
}

function RenameDepartmentModal({ department, onClose }: { department: Department; onClose: () => void }) {
  const rename = useRenameDepartment()
  const [name, setName] = useState(department.name)
  const trimmed = name.trim()

  async function submit() {
    await rename.mutateAsync({ id: department.id, name: trimmed })
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        title="Rename Workstream"
        icon={<Building2 size={16} className="text-brand-600" />}
        onClose={onClose}
      />
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workstream name"
            autoFocus
          />
        </div>
        <button
          className="btn-primary w-full"
          disabled={!trimmed || trimmed === department.name || rename.isPending}
          onClick={() => void submit()}
        >
          <Pencil size={16} /> Save name
        </button>
      </div>
    </Modal>
  )
}

function NewDepartmentModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const createDept = useCreateDepartment()
  const [name, setName] = useState('')

  async function submit() {
    await createDept.mutateAsync({ org_id: orgId, name: name.trim() })
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="New Workstream" icon={<Building2 size={16} className="text-brand-600" />} onClose={onClose} />
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workstream name"
            autoFocus
          />
        </div>
        <button
          className="btn-primary w-full"
          disabled={!name.trim() || createDept.isPending}
          onClick={() => void submit()}
        >
          <Plus size={16} /> Create Workstream
        </button>
      </div>
    </Modal>
  )
}

function DepartmentMembersModal({ department, onClose }: { department: Department; onClose: () => void }) {
  const { profile: viewer } = useAuth()
  const { data: people = [], isLoading } = useAllProfiles()
  const { data: departmentLeads = [] } = useDepartmentLeads()
  const { data: workstreamMembers = [] } = useWorkstreamMembers()
  const update = useUpdateProfile()
  const addLead = useAddDepartmentLead()
  const removeLead = useRemoveDepartmentLead()
  const addMember = useAddWorkstreamMember()
  const removeMember = useRemoveWorkstreamMember()
  const [addId, setAddId] = useState('')
  const [addLeadId, setAddLeadId] = useState('')

  // One list, whether someone is here as their primary Workstream
  // (department_id) or an additional one (workstream_members) - `isPrimary`
  // on each row is what the remove/lead actions branch on, not two separate
  // sections. A person's primary always wins if they're somehow both.
  const additionalMemberIds = new Set(
    workstreamMembers.filter((m) => m.department_id === department.id).map((m) => m.profile_id),
  )
  const members = [
    ...people.filter((p) => p.department_id === department.id).map((p) => ({ ...p, isPrimary: true as const })),
    ...people
      .filter((p) => additionalMemberIds.has(p.user_id) && p.department_id !== department.id)
      .map((p) => ({ ...p, isPrimary: false as const })),
  ]
  // Adding someone already covers both cases below - excluded here either way.
  const available = people.filter(
    (p) => p.is_active && p.department_id !== department.id && !additionalMemberIds.has(p.user_id),
  )

  function addPerson() {
    if (!addId) return
    if (viewer) {
      const person = people.find((p) => p.user_id === addId)
      // No primary Workstream yet: this becomes it, same as the original
      // single "Add a person" behaviour. Already has one elsewhere: add them
      // here without moving them off it.
      if (person && !person.department_id) {
        update.mutate({ id: addId, patch: { department_id: department.id } })
      } else {
        addMember.mutate({
          org_id: department.org_id,
          department_id: department.id,
          profile_id: addId,
          added_by: viewer.user_id,
        })
      }
    }
    setAddId('')
  }

  // Additional leads: admin/executive/HR profiles explicitly tagged as
  // leading this workstream on top of the department_id+role='dept_lead'
  // convention above - this is how the same person can lead several
  // workstreams at once. Doesn't require (or change) their department_id
  // membership. Note this is attribution only, same as it always was for
  // admin/executive: it doesn't by itself grant is_lead_or_admin()-gated
  // powers (approving workstream budgets, assigning task hours) - HR
  // specifically doesn't have those server-side regardless of this tag,
  // so tagging an HR person as lead here shows them in the Lead column but
  // doesn't change what they can do elsewhere in the app.
  const additionalLeadIds = new Set(
    departmentLeads.filter((dl) => dl.department_id === department.id).map((dl) => dl.profile_id),
  )
  const additionalLeads = people.filter((p) => additionalLeadIds.has(p.user_id))
  const availableLeads = people.filter(
    (p) =>
      p.is_active &&
      (p.role === 'admin' || p.role === 'executive' || p.role === 'hr_manager') &&
      !additionalLeadIds.has(p.user_id),
  )

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <ModalHeader title={department.name} icon={<Users2 size={16} className="text-brand-600" />} onClose={onClose} />

      {isLoading ? (
        <Spinner />
      ) : members.length === 0 ? (
        <p className="mb-3 text-sm text-ink-500">No members yet.</p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {members.map((m) => {
            const isLead = m.role === 'dept_lead'
            // Promoting to/from "lead" is really just a role change, and role
            // carries other tiers (admin, executive, HR...) this quick
            // toggle shouldn't touch — only offer it for staff/dept_lead, and
            // only for a primary member (their role isn't scoped per
            // Workstream, so it wouldn't mean anything for an additional one).
            const canToggleLead = m.isPrimary && (m.role === 'staff' || isLead)
            return (
              <li
                key={m.user_id}
                className="flex items-center justify-between rounded-lg border border-cream-300 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{m.full_name}</p>
                  <p className="truncate text-xs text-ink-500">
                    {m.email} · {ROLE_LABEL[m.role]}
                    {!m.isPrimary && ' · Additional'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canToggleLead && (
                    <button
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                        isLead ? 'bg-brand-100 text-brand-700' : 'text-ink-400 hover:bg-cream-200'
                      }`}
                      title={isLead ? 'Workstream lead — click to remove' : 'Make Workstream lead'}
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: m.user_id, patch: { role: isLead ? 'staff' : 'dept_lead' } })}
                    >
                      <Star size={13} fill={isLead ? 'currentColor' : 'none'} />
                      Lead
                    </button>
                  )}
                  <button
                    className="text-ink-400 hover:text-rose-600"
                    title="Remove from Workstream"
                    disabled={update.isPending || removeMember.isPending}
                    onClick={() =>
                      m.isPrimary
                        ? update.mutate({ id: m.user_id, patch: { department_id: null } })
                        : removeMember.mutate({ departmentId: department.id, profileId: m.user_id })
                    }
                  >
                    <UserMinus size={16} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex gap-2">
        <select className="input" value={addId} onChange={(e) => setAddId(e.target.value)}>
          <option value="">Add a person…</option>
          {available.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <button
          className="btn-primary shrink-0"
          disabled={!addId || update.isPending || addMember.isPending}
          onClick={addPerson}
        >
          <UserPlus size={16} /> Add
        </button>
      </div>

      <div className="mt-5 border-t border-cream-300 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Additional leads</p>
        <p className="mb-3 text-xs text-ink-500">
          An admin, executive, or HR can lead this Workstream alongside others, without moving
          them into it as a member.
        </p>

        {additionalLeads.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {additionalLeads.map((p) => (
              <li
                key={p.user_id}
                className="flex items-center justify-between rounded-lg border border-cream-300 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{p.full_name}</p>
                  <p className="truncate text-xs text-ink-500">
                    {p.email} · {ROLE_LABEL[p.role]}
                  </p>
                </div>
                <button
                  className="shrink-0 text-ink-400 hover:text-rose-600"
                  title="Remove as lead"
                  disabled={removeLead.isPending}
                  onClick={() => removeLead.mutate({ departmentId: department.id, profileId: p.user_id })}
                >
                  <UserMinus size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <select className="input" value={addLeadId} onChange={(e) => setAddLeadId(e.target.value)}>
            <option value="">Add a lead…</option>
            {availableLeads.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.full_name} ({ROLE_LABEL[p.role]})
              </option>
            ))}
          </select>
          <button
            className="btn-primary shrink-0"
            disabled={!addLeadId || addLead.isPending}
            onClick={() => {
              addLead.mutate({ org_id: department.org_id, department_id: department.id, profile_id: addLeadId })
              setAddLeadId('')
            }}
          >
            <Star size={16} /> Add
          </button>
        </div>
      </div>
    </Modal>
  )
}
