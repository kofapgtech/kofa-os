import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, KeyRound, LogOut, Save } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDepartments, useTaskAssignees, useTasks, useTimeEntries, useUpdateProfile } from '@/lib/queries'
import { supabase } from '@/lib/supabaseClient'
import { Avatar, Chip, PageHeader, StatCard } from '@/components/ui'
import { EMPLOYMENT_TYPE_LABEL, ROLE_LABEL, hours, minutesToHours } from '@/lib/format'

/**
 * Self-service account page — reached by clicking your own name/avatar in
 * the header. Deliberately narrower than the admin Employee modal: role,
 * department, capacity, and pay rate stay admin/HR-owned and aren't
 * editable (or, for rate, even visible) here. What a person CAN change
 * about themselves — name, title, photo, password — lives on this page.
 */
export function ProfilePage() {
  const { profile, signOut, updatePassword, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const { data: departments = [] } = useDepartments()
  const { data: tasks = [] } = useTasks()
  const { data: taskAssignees = [] } = useTaskAssignees()
  const update = useUpdateProfile()

  const weekStart = useMemo(() => {
    const d = new Date()
    const day = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }, [])
  const { data: myWeek = [] } = useTimeEntries({ userId: profile?.user_id, since: weekStart })

  const myTaskIds = useMemo(
    () => new Set(taskAssignees.filter((a) => a.profile_id === profile?.user_id).map((a) => a.task_id)),
    [taskAssignees, profile],
  )
  const myTasks = useMemo(() => tasks.filter((t) => myTaskIds.has(t.id)), [tasks, myTaskIds])
  const openTasks = myTasks.filter((t) => t.status !== 'done')
  const overdue = openTasks.filter((t) => t.due_date && new Date(t.due_date) < new Date())
  const weekHours = myWeek.reduce((sum, e) => sum + minutesToHours(e.duration_minutes), 0)

  const department = departments.find((d) => d.id === profile?.department_id)

  // ---------------------------------------------------------- name/title
  const [editingBasics, setEditingBasics] = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [title, setTitle] = useState(profile?.title ?? '')

  function startEditingBasics() {
    setFullName(profile?.full_name ?? '')
    setTitle(profile?.title ?? '')
    setEditingBasics(true)
  }

  async function saveBasics() {
    if (!profile || !fullName.trim()) return
    await update.mutateAsync({
      id: profile.user_id,
      patch: { full_name: fullName.trim(), title: title.trim() || null },
    })
    setEditingBasics(false)
  }

  // ------------------------------------------------------------- avatar
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  async function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile) return
    setUploading(true)
    setAvatarError(null)
    try {
      // Fixed path (no extension) + upsert so re-uploading a photo overwrites
      // the same object instead of accumulating orphaned files.
      const path = `${profile.user_id}/avatar`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${data.publicUrl}?v=${Date.now()}` // cache-bust everywhere the avatar renders
      await update.mutateAsync({ id: profile.user_id, patch: { avatar_url: url } })
      await refreshProfile()
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  // ---------------------------------------------------------- password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSaved, setPwSaved] = useState(false)

  async function savePassword() {
    setPwError(null)
    if (newPassword.length < 8) {
      setPwError('Use at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords don't match.")
      return
    }
    setPwSaving(true)
    const { error } = await updatePassword(newPassword)
    setPwSaving(false)
    if (error) {
      setPwError(error)
      return
    }
    setNewPassword('')
    setConfirmPassword('')
    setPwSaved(true)
    window.setTimeout(() => setPwSaved(false), 2500)
  }

  if (!profile) return null

  return (
    <div className="max-w-3xl">
      <PageHeader title="My profile" subtitle="Your account, your work at a glance, and your login." />

      <div className="mb-5 card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative shrink-0">
            <Avatar name={profile.full_name} avatarUrl={profile.avatar_url} size={72} />
            <button
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-cream-300 bg-white text-ink-600 hover:text-brand-700 disabled:opacity-50"
              onClick={() => fileInput.current?.click()}
              title="Change photo"
              disabled={uploading}
            >
              <Camera size={13} />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickAvatar(e)}
            />
          </div>

          <div className="min-w-0 flex-1">
            {editingBasics ? (
              <div className="max-w-sm space-y-2">
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                />
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                />
                <div className="flex gap-2">
                  <button
                    className="btn-primary !py-1.5 !px-3 text-sm"
                    onClick={() => void saveBasics()}
                    disabled={update.isPending || !fullName.trim()}
                  >
                    <Save size={14} /> Save
                  </button>
                  <button
                    className="btn-ghost !py-1.5 !px-3 text-sm"
                    onClick={() => setEditingBasics(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold text-ink-900">{profile.full_name}</p>
                  <button className="text-xs text-brand-700 hover:underline" onClick={startEditingBasics}>
                    Edit
                  </button>
                </div>
                <p className="text-sm text-ink-500">{profile.title ?? 'No title set'}</p>
              </>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip className="bg-brand-100 text-brand-700">{ROLE_LABEL[profile.role]}</Chip>
              {department && <Chip className="bg-cream-200 text-ink-600">{department.name}</Chip>}
              <Chip className="bg-cream-200 text-ink-600">{EMPLOYMENT_TYPE_LABEL[profile.employment_type]}</Chip>
              {!profile.is_active && <Chip className="bg-rose-100 text-rose-700">Inactive</Chip>}
            </div>
          </div>
        </div>

        {avatarError && <p className="mt-3 text-xs text-rose-600">{avatarError}</p>}

        <div className="mt-4 grid gap-3 border-t border-cream-200 pt-4 sm:grid-cols-2">
          <div>
            <p className="label !mb-0.5">Email</p>
            <p className="text-sm text-ink-700">{profile.email}</p>
          </div>
          <div>
            <p className="label !mb-0.5">Capacity</p>
            <p className="text-sm text-ink-700">{profile.capacity_hours_per_week}h / week</p>
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Hours this week" value={hours(weekHours)} />
        <StatCard label="Open tasks" value={openTasks.length} />
        <StatCard
          label="Overdue"
          value={overdue.length}
          tone={overdue.length > 0 ? 'text-rose-600' : 'text-ink-900'}
        />
      </div>

      <div className="card p-5">
        <p className="mb-3 text-sm font-semibold text-ink-900">Account &amp; security</p>

        <div className="max-w-sm space-y-3">
          <div>
            <label className="label">New password</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {pwError && <p className="text-xs text-rose-600">{pwError}</p>}
          {pwSaved && <p className="text-xs text-brand-700">Password updated.</p>}
          <button
            className="btn-primary"
            onClick={() => void savePassword()}
            disabled={pwSaving || !newPassword}
          >
            <KeyRound size={15} /> Update password
          </button>
        </div>

        <div className="mt-5 border-t border-cream-200 pt-4">
          <button
            className="btn-ghost"
            onClick={async () => {
              await signOut()
              navigate('/login')
            }}
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
