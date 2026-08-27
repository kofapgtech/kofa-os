import { useState, type ReactNode } from 'react'
import { Building2, Plus, Star, UserMinus, UserPlus, Users2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useAllProfiles, useCreateDepartment, useDepartments, useUpdateProfile } from '@/lib/queries'
import { EmptyState, Modal, ModalHeader, PageHeader, SortableTh, Spinner, sortRows, useTableSort } from '@/components/ui'
import type { Department, UserRole } from '@/lib/types'

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  executive: 'Executive',
  dept_lead: 'Department lead',
  billing_finance: 'Billing/Finance',
  hr_manager: 'HR',
  staff: 'Staff',
}

export function AdminDepartments() {
  const { profile, isAdminOrExecutive } = useAuth()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Department | null>(null)

  if (!isAdminOrExecutive) {
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
  const sort = useTableSort<'name' | 'members' | 'lead'>()

  const rows = departments.map((d) => {
    const members = people.filter((p) => p.department_id === d.id)
    const leads = members.filter((p) => p.role === 'dept_lead')
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
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
  const { data: people = [], isLoading } = useAllProfiles()
  const update = useUpdateProfile()
  const [addId, setAddId] = useState('')

  const members = people.filter((p) => p.department_id === department.id)
  const available = people.filter((p) => p.is_active && p.department_id !== department.id)

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
            // carries other tiers (admin, billing/finance, HR...) this quick
            // toggle shouldn't touch — only offer it for staff/dept_lead.
            const canToggleLead = m.role === 'staff' || isLead
            return (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-cream-300 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{m.full_name}</p>
                  <p className="truncate text-xs text-ink-500">
                    {m.email} · {ROLE_LABEL[m.role]}
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
                      onClick={() => update.mutate({ id: m.id, patch: { role: isLead ? 'staff' : 'dept_lead' } })}
                    >
                      <Star size={13} fill={isLead ? 'currentColor' : 'none'} />
                      Lead
                    </button>
                  )}
                  <button
                    className="text-ink-400 hover:text-rose-600"
                    title="Remove from Workstream"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: m.id, patch: { department_id: null } })}
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
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <button
          className="btn-primary shrink-0"
          disabled={!addId || update.isPending}
          onClick={() => {
            update.mutate({ id: addId, patch: { department_id: department.id } })
            setAddId('')
          }}
        >
          <UserPlus size={16} /> Add
        </button>
      </div>
    </Modal>
  )
}
