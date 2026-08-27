import { useState } from 'react'
import { FileCheck2, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCreateDeliverable, useTasks } from '@/lib/queries'
import type { Profile, Task } from '@/lib/types'
import { Modal, ModalHeader } from './ui'

export interface DeliverableFormValues {
  title: string
  description: string
  taskId: string
  ownerId: string
  reviewerId: string
  dueDate: string
}

export const EMPTY_DELIVERABLE_FORM: DeliverableFormValues = {
  title: '',
  description: '',
  taskId: '',
  ownerId: '',
  reviewerId: '',
  dueDate: '',
}

/** Shared field set — used both for the New Deliverable modal and for
 *  editing an existing one's basics from inside DeliverablePanel. */
export function DeliverableFormFields({
  values,
  onChange,
  people,
  tasks,
  autoFocus = true,
}: {
  values: DeliverableFormValues
  onChange: (patch: Partial<DeliverableFormValues>) => void
  people: Profile[]
  tasks: Task[]
  autoFocus?: boolean
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Title</label>
        <input
          className="input"
          value={values.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="What's being delivered?"
          autoFocus={autoFocus}
        />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea
          className="input min-h-[70px]"
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Optional"
        />
      </div>
      {tasks.length > 0 && (
        <div>
          <label className="label">Linked task</label>
          <select
            className="input"
            value={values.taskId}
            onChange={(e) => onChange({ taskId: e.target.value })}
          >
            <option value="">No linked task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Owner</label>
          <select
            className="input"
            value={values.ownerId}
            onChange={(e) => onChange({ ownerId: e.target.value })}
          >
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Reviewer</label>
          <select
            className="input"
            value={values.reviewerId}
            onChange={(e) => onChange({ reviewerId: e.target.value })}
          >
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Due date</label>
        <input
          className="input"
          type="date"
          value={values.dueDate}
          onChange={(e) => onChange({ dueDate: e.target.value })}
        />
      </div>
    </div>
  )
}

/**
 * Creates a new deliverable. `projectId` fixed (from a project's Deliverables
 * tab) or `projects` supplied for a picker (from the global Deliverables page).
 */
export function NewDeliverableModal({
  projectId,
  projects,
  people,
  onClose,
}: {
  projectId?: string
  projects?: { project_id: string; name: string }[]
  people: Profile[]
  onClose: () => void
}) {
  const { profile } = useAuth()
  const create = useCreateDeliverable()
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? '')
  const { data: tasks = [] } = useTasks(selectedProjectId || undefined)
  // Default the owner to whoever's creating it — the update RLS only lets
  // the owner, reviewer, or a lead edit a deliverable afterward, so leaving
  // this at "Unassigned" would lock a regular staff creator out of their own
  // deliverable until a lead stepped in to assign it.
  const [values, setValues] = useState<DeliverableFormValues>({
    ...EMPTY_DELIVERABLE_FORM,
    ownerId: profile?.id ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  function patch(p: Partial<DeliverableFormValues>) {
    setValues((v) => ({ ...v, ...p }))
  }

  async function submit() {
    if (!profile || !selectedProjectId || !values.title.trim()) return
    setError(null)
    try {
      await create.mutateAsync({
        org_id: profile.org_id,
        project_id: selectedProjectId,
        title: values.title.trim(),
        description: values.description.trim() || null,
        task_id: values.taskId || null,
        owner_id: values.ownerId || null,
        reviewer_id: values.reviewerId || null,
        due_date: values.dueDate || null,
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <ModalHeader
        title="New deliverable"
        icon={<FileCheck2 size={16} className="text-brand-600" />}
        onClose={onClose}
      />

      {projects && (
        <div className="mb-3">
          <label className="label">Project</label>
          <select
            className="input"
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value)
              patch({ taskId: '' })
            }}
            autoFocus
          >
            <option value="">Choose a project</option>
            {projects.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <DeliverableFormFields
        values={values}
        onChange={patch}
        people={people}
        tasks={tasks}
        autoFocus={!projects}
      />

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <button
        className="btn-primary mt-4 w-full"
        disabled={!selectedProjectId || !values.title.trim() || create.isPending}
        onClick={() => void submit()}
      >
        <Plus size={16} /> Create deliverable
      </button>
    </Modal>
  )
}
