import { useState, type ReactNode } from 'react'
import { Plus, Star, UserMinus, UserPlus, Users2, Waypoints } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useAddWorkstreamMember,
  useAllProfiles,
  useAllWorkstreams,
  useCreateWorkstream,
  useRemoveWorkstreamMember,
  useSetWorkstreamLead,
  useWorkstreamLeadMap,
  useWorkstreamMembers,
} from '@/lib/queries'
import { EmptyState, Modal, ModalHeader, PageHeader, Spinner } from '@/components/ui'
import type { WorkstreamWithCount } from '@/lib/types'

export function AdminWorkstreams() {
  const { profile, isAdminOrExecutive } = useAuth()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<WorkstreamWithCount | null>(null)

  if (!isAdminOrExecutive) {
    return <EmptyState title="No admin access" hint="Ask an admin for access to this page." />
  }

  return (
    <div>
      <PageHeader
        title="Workstreams"
        subtitle="Company-wide teams. Tasks get routed to a workstream instead of a project's roster; its lead assigns the work from there."
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Waypoints size={16} /> New work stream
          </button>
        }
      />
      <WorkstreamsCard onSelect={setSelected} />
      {creating && (
        <NewWorkstreamModal orgId={profile!.org_id} actorId={profile!.id} onClose={() => setCreating(false)} />
      )}
      {selected && (
        <WorkstreamMembersModal
          workstream={selected}
          actorId={profile!.id}
          onClose={() => setSelected(null)}
        />
      )}
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

function WorkstreamsCard({ onSelect }: { onSelect: (ws: WorkstreamWithCount) => void }) {
  const { data: workstreams = [], isLoading } = useAllWorkstreams()

  return (
    <Section title="Work streams" icon={<Waypoints size={16} className="text-brand-600" />}>
      {isLoading ? (
        <Spinner />
      ) : workstreams.length === 0 ? (
        <EmptyState title="No work streams yet." hint="Create one to start routing tasks to it." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Members</th>
              </tr>
            </thead>
            <tbody>
              {workstreams.map((ws) => (
                <tr
                  key={ws.id}
                  className="cursor-pointer border-b border-cream-200 last:border-0 hover:bg-cream-100"
                  onClick={() => onSelect(ws)}
                >
                  <td className="py-2 pr-3 font-medium text-ink-900">{ws.name}</td>
                  <td className="py-2 pr-3 tabular-nums text-ink-700">{ws.member_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

function NewWorkstreamModal({
  orgId,
  actorId,
  onClose,
}: {
  orgId: string
  actorId: string
  onClose: () => void
}) {
  const createWs = useCreateWorkstream()
  const [wsName, setWsName] = useState('')
  const [description, setDescription] = useState('')

  async function submit() {
    await createWs.mutateAsync({
      org_id: orgId,
      name: wsName.trim(),
      description: description.trim() || null,
      created_by: actorId,
    })
    onClose()
  }

  const canSubmit = !!wsName.trim()

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="New work stream" icon={<Waypoints size={16} className="text-brand-600" />} onClose={onClose} />
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="Work stream name"
            autoFocus
          />
        </div>
        <div>
          <label className="label">Description</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <button
          className="btn-primary w-full"
          disabled={!canSubmit || createWs.isPending}
          onClick={() => void submit()}
        >
          <Plus size={16} /> Create work stream
        </button>
      </div>
    </Modal>
  )
}

function WorkstreamMembersModal({
  workstream,
  actorId,
  onClose,
}: {
  workstream: WorkstreamWithCount
  actorId: string
  onClose: () => void
}) {
  const { data: members = [], isLoading } = useWorkstreamMembers(workstream.id)
  const { data: allProfiles = [] } = useAllProfiles()
  const { data: leadMap } = useWorkstreamLeadMap()
  const addMember = useAddWorkstreamMember()
  const removeMember = useRemoveWorkstreamMember()
  const setLead = useSetWorkstreamLead()
  const [addId, setAddId] = useState('')

  const memberIds = new Set(members.map((m) => m.profile_id))
  const available = allProfiles.filter((p) => p.is_active && !memberIds.has(p.id))

  async function addSelected() {
    if (!addId) return
    await addMember.mutateAsync({ workstream_id: workstream.id, profile_id: addId, added_by: actorId })
    setAddId('')
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <ModalHeader
        title={workstream.name}
        icon={<Users2 size={16} className="text-brand-600" />}
        onClose={onClose}
      />

      {isLoading ? (
        <Spinner />
      ) : members.length === 0 ? (
        <p className="mb-3 text-sm text-ink-500">No members yet.</p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {members.map((m) => {
            // A profile can lead only one workstream (DB-enforced) — block
            // making someone lead here if they already lead elsewhere.
            const leadsElsewhere = leadMap?.get(m.profile_id)
            const blocked = !m.is_lead && !!leadsElsewhere && leadsElsewhere.workstreamId !== workstream.id
            return (
              <li
                key={m.profile_id}
                className="flex items-center justify-between rounded-lg border border-cream-300 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{m.profile.full_name}</p>
                  <p className="truncate text-xs text-ink-500">{m.profile.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                      m.is_lead
                        ? 'bg-brand-100 text-brand-700'
                        : blocked
                          ? 'cursor-not-allowed text-ink-300'
                          : 'text-ink-400 hover:bg-cream-200'
                    }`}
                    title={
                      m.is_lead
                        ? 'Coordination lead — click to remove'
                        : blocked
                          ? `Already leads ${leadsElsewhere!.workstreamName}`
                          : 'Make coordination lead'
                    }
                    disabled={setLead.isPending || blocked}
                    onClick={() =>
                      setLead.mutate({ workstream_id: workstream.id, profile_id: m.profile_id, is_lead: !m.is_lead })
                    }
                  >
                    <Star size={13} fill={m.is_lead ? 'currentColor' : 'none'} />
                    Lead
                  </button>
                  <button
                    className="text-ink-400 hover:text-rose-600"
                    title="Remove from work stream"
                    disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate({ workstream_id: workstream.id, profile_id: m.profile_id })}
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
        <button className="btn-primary shrink-0" disabled={!addId || addMember.isPending} onClick={() => void addSelected()}>
          <UserPlus size={16} /> Add
        </button>
      </div>
    </Modal>
  )
}
