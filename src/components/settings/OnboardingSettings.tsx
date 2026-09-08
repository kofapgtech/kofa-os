import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BookOpen,
  Check,
  FileText,
  GripVertical,
  ListChecks,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import {
  useDeleteOnboardingAgreement,
  useDeleteOnboardingReading,
  useOnboardingAgreements,
  useOnboardingReading,
  useOnboardingSettings,
  useSaveOnboardingAgreement,
  useUpdateOnboardingSettings,
  useUpsertOnboardingReading,
} from '@/lib/queries'
import { ConfirmDialog, EmptyState, Modal, ModalHeader, Spinner, TabButton } from '@/components/ui'
import { Markdown } from '@/components/docs/Markdown'
import { DOCS, groupBySection } from '@/docs'
import { countPdfFormFields } from '@/lib/pdfForm'
import type {
  EmploymentType,
  OnboardingAgreement,
  OnboardingAgreementSource,
  OnboardingStep,
} from '@/lib/types'

const ALL_TRACKS: EmploymentType[] = ['employee', 'contractor']
const TRACK_LABEL: Record<EmploymentType, string> = {
  employee: 'Employees',
  contractor: 'Contractors',
}

/** Mirrors WorkspaceSettings' SectionHeader so the two tabs read as one page. */
function Section({
  icon,
  tone,
  title,
  description,
  actions,
  children,
}: {
  icon: ReactNode
  tone: string
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>{icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">{title}</p>
            {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/** The employee/contractor track picker, used on steps, agreements and
 *  articles alike — the split is the same idea in all three places.
 *
 *  Refuses to deselect the last track: `applies_to` carries a
 *  `array_length >= 1` check in Postgres, and a row that applies to nobody is
 *  indistinguishable from one that is switched off, which `enabled` already
 *  says more clearly. */
function TrackPicker({
  value,
  onChange,
  disabled,
}: {
  value: EmploymentType[]
  onChange: (next: EmploymentType[]) => void
  disabled?: boolean
}) {
  return (
    <div className="flex gap-1">
      {ALL_TRACKS.map((t) => {
        const on = value.includes(t)
        const isLastOn = on && value.length === 1
        return (
          <button
            key={t}
            type="button"
            disabled={disabled || isLastOn}
            title={isLastOn ? 'At least one must apply' : undefined}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              on
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-cream-300 text-ink-500 hover:text-ink-700'
            } ${disabled || isLastOn ? 'cursor-default opacity-70' : ''}`}
            onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}
          >
            {TRACK_LABEL[t]}
          </button>
        )
      })}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-cream-300 text-brand-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm text-ink-800">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-500">{hint}</span>}
      </span>
    </label>
  )
}

// ------------------------------------------------------------------- welcome

function WelcomeSection() {
  const { data: settings } = useOnboardingSettings()
  const update = useUpdateOnboardingSettings()

  const [enabled, setEnabled] = useState(true)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    if (!settings) return
    setEnabled(settings.enabled)
    setTitle(settings.welcome_title)
    setBody(settings.welcome_body)
    setVideoUrl(settings.welcome_video_url ?? '')
  }, [settings])

  if (!settings) return null

  const dirty =
    enabled !== settings.enabled ||
    title !== settings.welcome_title ||
    body !== settings.welcome_body ||
    (videoUrl.trim() || null) !== settings.welcome_video_url

  return (
    <Section
      icon={<Sparkles size={16} />}
      tone="bg-brand-50 text-brand-600"
      title="Welcome"
      description="The first screen a new hire sees, and the master switch for the whole flow"
      actions={
        <button
          className="btn-primary !py-1.5 !px-3 text-sm"
          disabled={!dirty || update.isPending}
          onClick={() =>
            update.mutate({
              enabled,
              welcome_title: title.trim() || 'Welcome to the team',
              welcome_body: body,
              welcome_video_url: videoUrl.trim() || null,
            })
          }
        >
          <Check size={15} /> Save
        </button>
      }
    >
      <Toggle
        checked={enabled}
        onChange={setEnabled}
        label="Onboarding is on"
        hint="Off means no setup banner and no /onboarding screen for anyone. Existing progress and signatures are kept."
      />

      <div>
        <label className="label">Heading</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="label !mb-0">Message</label>
          <div className="flex border-b border-cream-200">
            <TabButton active={!preview} onClick={() => setPreview(false)}>
              Write
            </TabButton>
            <TabButton active={preview} onClick={() => setPreview(true)}>
              Preview
            </TabButton>
          </div>
        </div>
        {preview ? (
          <div className="rounded-xl border border-cream-200 bg-white p-4">
            {body.trim() ? <Markdown body={body} /> : <p className="text-sm text-ink-500">Nothing written yet.</p>}
          </div>
        ) : (
          <textarea
            className="input min-h-[140px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Markdown is supported — headings, bold, lists, links."
          />
        )}
      </div>

      <div>
        <label className="label">Welcome video (optional)</label>
        <input
          className="input"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://…"
        />
        <p className="mt-1 text-xs text-ink-500">
          Shown as a link beside the message. Any URL your team can open.
        </p>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------- agreements

/** Upload paths are `<org_id>/<random>/<filename>` — org first, because the
 *  bucket policy checks the first segment against current_org_id(), and a
 *  random middle segment rather than the row id because the file is uploaded
 *  before the row exists. */
async function uploadAgreementFile(
  orgId: string,
  file: File,
): Promise<{ key: string; fieldCount: number }> {
  const key = `${orgId}/${crypto.randomUUID()}/${file.name}`
  const { error } = await supabase.storage.from('onboarding-docs').upload(key, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) {
    throw new Error(
      error.message.includes('Bucket not found')
        ? "Document storage isn't set up yet — an admin needs to run the onboarding-docs bucket migration."
        : error.message,
    )
  }
  // Counted here, once, rather than on every signing: it decides whether the
  // wizard loads the PDF form machinery at all, and it lets this screen tell an
  // admin what they have just uploaded instead of letting them find out from a
  // new hire. A parse failure counts as zero — a document we cannot read the
  // form of is one we must not promise to fill.
  const fieldCount = await countPdfFormFields(await file.arrayBuffer())
  return { key, fieldCount }
}

/**
 * Recount the fields of a PDF that is already in storage.
 *
 * `form_field_count` used to be written once, at upload, which made it a latch
 * rather than a fact: an agreement uploaded before field detection existed --
 * or one whose count failed to parse that day -- stayed at 0 forever, and the
 * wizard went on rendering it as a flat read-and-sign document. Someone then
 * types their details into the browser's own PDF viewer and every keystroke is
 * discarded on navigation, which is the worst possible failure because it looks
 * like it worked. This makes the count self-healing: opening the agreement to
 * edit it re-derives the number from the actual file.
 *
 * Returns null rather than 0 when it cannot tell. A network blip or an expired
 * URL must never overwrite a good count with "no fields".
 */
async function countFieldsInStoredPdf(path: string): Promise<number | null> {
  try {
    const { data, error } = await supabase.storage
      .from('onboarding-docs')
      .createSignedUrl(path, 120)
    if (error || !data?.signedUrl) return null
    const res = await fetch(data.signedUrl)
    if (!res.ok) return null
    return await countPdfFormFields(await res.arrayBuffer())
  } catch {
    return null
  }
}

function AgreementModal({
  agreement,
  nextSortOrder,
  onClose,
}: {
  agreement: OnboardingAgreement | null
  nextSortOrder: number
  onClose: () => void
}) {
  const { profile } = useAuth()
  const save = useSaveOnboardingAgreement()

  const [title, setTitle] = useState(agreement?.title ?? '')
  const [summary, setSummary] = useState(agreement?.summary ?? '')
  const [source, setSource] = useState<OnboardingAgreementSource>(agreement?.source ?? 'text')
  const [bodyMd, setBodyMd] = useState(agreement?.body_md ?? '')
  const [filePath, setFilePath] = useState(agreement?.file_path ?? '')
  const [fileName, setFileName] = useState(agreement?.file_name ?? '')
  const [fieldCount, setFieldCount] = useState(agreement?.form_field_count ?? 0)
  const [tracks, setTracks] = useState<EmploymentType[]>(agreement?.applies_to ?? ALL_TRACKS)
  const [required, setRequired] = useState(agreement?.is_required ?? true)
  const [active, setActive] = useState(agreement?.is_active ?? true)
  const [preview, setPreview] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** True when opening this agreement found fillable fields that weren't
   *  recorded before — i.e. it has been collecting nothing but typed names. */
  const [detectedLate, setDetectedLate] = useState(false)
  const [recounting, setRecounting] = useState(false)

  // Re-derive the field count from the stored file whenever we open a PDF
  // agreement that claims to have none. Only that case: a count above zero was
  // already measured from the real document, and re-fetching every PDF on every
  // edit would spend a download to confirm what we already know.
  useEffect(() => {
    const path = agreement?.file_path
    if (!agreement || agreement.source !== 'file' || !path) return
    if (agreement.form_field_count > 0) return
    let alive = true
    setRecounting(true)
    void countFieldsInStoredPdf(path).then((count) => {
      if (!alive) return
      setRecounting(false)
      if (count && count > 0) {
        setFieldCount(count)
        setDetectedLate(true)
      }
    })
    return () => {
      alive = false
    }
  }, [agreement])

  // Whether the wording itself changed. Metadata edits (renaming, reordering,
  // switching which track it applies to) must NOT invalidate signatures, so
  // only a body or file change offers the re-sign checkbox.
  const contentChanged =
    !!agreement &&
    (source !== agreement.source ||
      (source === 'text' && bodyMd !== (agreement.body_md ?? '')) ||
      (source === 'file' && filePath !== (agreement.file_path ?? '')))
  const [requireResign, setRequireResign] = useState(false)
  useEffect(() => setRequireResign(contentChanged), [contentChanged])

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile) return
    setError(null)
    setUploading(true)
    try {
      const { key, fieldCount: count } = await uploadAgreementFile(profile.org_id, file)
      setFilePath(key)
      setFileName(file.name)
      setFieldCount(count)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const bodyReady = source === 'text' ? !!bodyMd.trim() : !!filePath
  const canSubmit = !!title.trim() && bodyReady && tracks.length > 0 && !uploading && !save.isPending

  async function submit() {
    setError(null)
    try {
      await save.mutateAsync({
        id: agreement?.id,
        title: title.trim(),
        summary: summary.trim() || null,
        source,
        body_md: source === 'text' ? bodyMd : null,
        file_path: source === 'file' ? filePath : null,
        file_name: source === 'file' ? fileName || null : null,
        applies_to: tracks,
        is_required: required,
        sort_order: agreement?.sort_order ?? nextSortOrder,
        is_active: active,
        // Text agreements have no form fields by definition, so switching a
        // PDF agreement over to text must clear the count rather than leave a
        // stale one telling the wizard to load a form that isn't there.
        form_field_count: source === 'file' ? fieldCount : 0,
        version: agreement && requireResign ? agreement.version + 1 : agreement?.version,
      })
      // Best-effort cleanup of the replaced object. A failure here leaves an
      // orphaned file in the bucket, which is harmless; failing the save over
      // it would not be.
      if (agreement?.file_path && agreement.file_path !== filePath) {
        await supabase.storage.from('onboarding-docs').remove([agreement.file_path])
      }
      onClose()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        title={agreement ? 'Edit agreement' : 'New agreement'}
        icon={<FileText size={16} />}
        onClose={onClose}
      />
      <div className="space-y-4 p-5">
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mutual non-disclosure agreement"
          />
        </div>

        <div>
          <label className="label">One-line summary (optional)</label>
          <input
            className="input"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What this covers, in plain English."
          />
        </div>

        <div>
          <label className="label">Document</label>
          <div className="mb-2 flex border-b border-cream-200">
            <TabButton active={source === 'text'} onClick={() => setSource('text')}>
              Write it here
            </TabButton>
            <TabButton active={source === 'file'} onClick={() => setSource('file')}>
              Upload a PDF
            </TabButton>
          </div>

          {source === 'text' ? (
            <>
              <div className="mb-1 flex justify-end border-b border-cream-200">
                <TabButton active={!preview} onClick={() => setPreview(false)}>
                  Write
                </TabButton>
                <TabButton active={preview} onClick={() => setPreview(true)}>
                  Preview
                </TabButton>
              </div>
              {preview ? (
                <div className="max-h-72 overflow-y-auto rounded-xl border border-cream-200 bg-white p-4">
                  {bodyMd.trim() ? (
                    <Markdown body={bodyMd} />
                  ) : (
                    <p className="text-sm text-ink-500">Nothing written yet.</p>
                  )}
                </div>
              ) : (
                <textarea
                  className="input min-h-[200px] font-mono text-xs"
                  value={bodyMd}
                  onChange={(e) => setBodyMd(e.target.value)}
                  placeholder="Paste or write the agreement. Markdown is supported."
                />
              )}
            </>
          ) : (
            <div className="space-y-2">
              <label className="btn-ghost w-full cursor-pointer justify-center">
                <Upload size={15} /> {uploading ? 'Uploading…' : filePath ? 'Replace file' : 'Choose a PDF'}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => void onPickFile(e)}
                />
              </label>
              {filePath && (
                <>
                  <p className="flex items-center gap-2 text-xs text-ink-600">
                    <FileText size={13} className="text-ink-400" />
                    {fileName || filePath.split('/').pop()}
                  </p>
                  {detectedLate && (
                    <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                      <strong>This document has fillable fields that weren't recorded.</strong> It
                      was being shown as read-and-sign only, so nothing anyone typed on it was
                      saved. Saving now fixes that.
                    </p>
                  )}
                  {recounting && (
                    <p className="rounded-lg bg-cream-100 px-2.5 py-2 text-xs text-ink-500">
                      Checking the document for fillable fields…
                    </p>
                  )}
                  <p
                    className={`rounded-lg px-2.5 py-2 text-xs ${
                      fieldCount > 0 ? 'bg-brand-50 text-brand-800' : 'bg-cream-100 text-ink-600'
                    }`}
                  >
                    {fieldCount > 0 ? (
                      <>
                        <strong>
                          {fieldCount} form {fieldCount === 1 ? 'field' : 'fields'} detected.
                        </strong>{' '}
                        People fill these in on the document itself. Their answers are saved with
                        the signature, and a flattened copy of the completed document is kept.
                        Signature boxes are stamped with their typed name automatically.
                      </>
                    ) : (
                      <>
                        No form fields — this is read-and-sign only. If the document has blanks
                        people are meant to complete, they have to be real PDF form fields for the
                        answers to be captured; a line drawn on the page can't be.
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="label">Who signs this</label>
          <TrackPicker value={tracks} onChange={setTracks} />
        </div>

        <Toggle
          checked={required}
          onChange={setRequired}
          label="Required"
          hint="Required documents keep the setup banner showing until they are signed."
        />
        <Toggle
          checked={active}
          onChange={setActive}
          label="In use"
          hint="Turn off to retire a document without deleting it — past signatures stay on record."
        />

        {(contentChanged || detectedLate) && (
          <Toggle
            checked={requireResign}
            onChange={setRequireResign}
            label={`Everyone signs again (version ${agreement!.version} → ${agreement!.version + 1})`}
            hint={
              detectedLate && !contentChanged
                ? 'Anyone who already signed did so before these fields were detected, so their record holds no answers. Turn this on to collect them properly.'
                : 'Leave on when the wording changed. Off keeps existing signatures valid — only use that for a typo fix.'
            }
          />
        )}

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-cream-200 pt-4">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!canSubmit} onClick={() => void submit()}>
            <Check size={16} /> {agreement ? 'Save changes' : 'Add agreement'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function AgreementsSection() {
  const { data: agreements = [], isLoading } = useOnboardingAgreements()
  const save = useSaveOnboardingAgreement()
  const remove = useDeleteOnboardingAgreement()
  const [editing, setEditing] = useState<OnboardingAgreement | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState<OnboardingAgreement | null>(null)

  const nextSortOrder = agreements.length
    ? Math.max(...agreements.map((a) => a.sort_order)) + 10
    : 10

  /** Swaps sort_order with the neighbour rather than renumbering the list, so
   *  one move is two writes regardless of how many agreements exist.
   *
   *  Fields are listed rather than spread on purpose: spreading the row would
   *  also send org_id, created_at and created_by back as an update, and
   *  `version` must be passed through unchanged — reordering is not a reason
   *  for anyone to re-sign. */
  function reorderTo(a: OnboardingAgreement, sortOrder: number) {
    save.mutate({
      id: a.id,
      title: a.title,
      summary: a.summary,
      source: a.source,
      body_md: a.body_md,
      file_path: a.file_path,
      file_name: a.file_name,
      applies_to: a.applies_to,
      is_required: a.is_required,
      is_active: a.is_active,
      sort_order: sortOrder,
      form_field_count: a.form_field_count,
      version: a.version,
    })
  }

  function move(index: number, delta: number) {
    const a = agreements[index]
    const b = agreements[index + delta]
    if (!a || !b) return
    reorderTo(a, b.sort_order)
    reorderTo(b, a.sort_order)
  }

  async function confirmDelete() {
    const a = confirmingDelete
    setConfirmingDelete(null)
    if (!a) return
    if (a.file_path) await supabase.storage.from('onboarding-docs').remove([a.file_path])
    remove.mutate(a.id)
  }

  return (
    <Section
      icon={<FileText size={16} />}
      tone="bg-amber-50 text-amber-700"
      title="Agreements"
      description="Documents a new hire reads and signs by typing their name"
      actions={
        <button className="btn-ghost !py-1.5 !px-3 text-sm" onClick={() => setCreating(true)}>
          <Plus size={15} /> Add
        </button>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : agreements.length === 0 ? (
        <p className="text-sm text-ink-500">
          Nothing added yet. Upload your NDA and contractor agreement, or write them here.
        </p>
      ) : (
        <ul className="divide-y divide-cream-200">
          {agreements.map((a, i) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-col text-ink-400">
                <button
                  className="hover:text-ink-700 disabled:opacity-30"
                  disabled={i === 0}
                  title="Move up"
                  onClick={() => move(i, -1)}
                >
                  <GripVertical size={14} className="rotate-180" />
                </button>
                <button
                  className="hover:text-ink-700 disabled:opacity-30"
                  disabled={i === agreements.length - 1}
                  title="Move down"
                  onClick={() => move(i, 1)}
                >
                  <GripVertical size={14} />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-sm font-medium ${a.is_active ? 'text-ink-900' : 'text-ink-400'}`}>
                    {a.title}
                  </p>
                  <span className="rounded-full bg-cream-200 px-2 py-0.5 text-[11px] text-ink-600">
                    {a.source === 'file' ? 'PDF' : 'Text'} · v{a.version}
                  </span>
                  {a.form_field_count > 0 ? (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">
                      {a.form_field_count} form {a.form_field_count === 1 ? 'field' : 'fields'}
                    </span>
                  ) : a.source === 'file' ? (
                    // Not necessarily wrong -- plenty of agreements are flat --
                    // but it is the one state where a fillable document would be
                    // silently collecting nothing, so it is worth a look.
                    <span
                      className="rounded-full bg-cream-200 px-2 py-0.5 text-[11px] text-ink-600"
                      title="Read-and-sign only. Open it to re-check for fillable fields."
                    >
                      No form fields
                    </span>
                  ) : null}
                  {!a.is_required && (
                    <span className="rounded-full bg-cream-200 px-2 py-0.5 text-[11px] text-ink-600">
                      Optional
                    </span>
                  )}
                  {!a.is_active && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] text-rose-700">
                      Retired
                    </span>
                  )}
                </div>
                {a.summary && <p className="mt-0.5 text-xs text-ink-500">{a.summary}</p>}
                <p className="mt-1 text-xs text-ink-500">
                  {a.applies_to.map((t) => TRACK_LABEL[t]).join(' and ')}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  className="rounded-lg p-1.5 text-ink-500 hover:bg-cream-200 hover:text-ink-800"
                  title="Edit"
                  onClick={() => setEditing(a)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="rounded-lg p-1.5 text-ink-500 hover:bg-rose-50 hover:text-rose-700"
                  title="Delete"
                  onClick={() => setConfirmingDelete(a)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <AgreementModal
          agreement={editing}
          nextSortOrder={nextSortOrder}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${confirmingDelete.title}"?`}
          message="Every signature recorded against it is deleted too. To stop asking new hires for it while keeping the record, edit it and turn off 'In use' instead."
          confirmLabel="Delete"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}
    </Section>
  )
}

// ------------------------------------------------------------------- reading

function ReadingSection() {
  const { data: rows = [], isLoading } = useOnboardingReading()
  const upsert = useUpsertOnboardingReading()
  const remove = useDeleteOnboardingReading()

  const bySlug = useMemo(() => new Map(rows.map((r) => [r.doc_slug, r])), [rows])
  const sections = useMemo(() => groupBySection(DOCS), [])
  const docIndex = useMemo(() => new Map(DOCS.map((d, i) => [d.slug, i])), [])

  const chosen = rows.length

  return (
    <Section
      icon={<BookOpen size={16} />}
      tone="bg-sky-50 text-sky-700"
      title="Required reading"
      description="Pages from Help & docs a new hire ticks off as they read them"
      actions={
        <span className="text-xs text-ink-500">
          {chosen} of {DOCS.length} selected
        </span>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.name}>
              <p className="label">{section.name}</p>
              <ul className="space-y-1.5">
                {section.docs.map((doc) => {
                  const row = bySlug.get(doc.slug)
                  return (
                    <li
                      key={doc.slug}
                      className={`rounded-xl border px-3 py-2 ${
                        row ? 'border-brand-200 bg-brand-50/40' : 'border-cream-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-cream-300 text-brand-600"
                            checked={!!row}
                            onChange={(e) =>
                              e.target.checked
                                ? upsert.mutate({
                                    doc_slug: doc.slug,
                                    applies_to: ALL_TRACKS,
                                    is_required: true,
                                    // Seeded from the article's own position so
                                    // the reading order matches the docs sidebar
                                    // without anyone ordering it by hand.
                                    sort_order: (docIndex.get(doc.slug) ?? 0) * 10,
                                  })
                                : remove.mutate(doc.slug)
                            }
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-ink-800">{doc.title}</span>
                            <span className="mt-0.5 block text-xs text-ink-500">{doc.summary}</span>
                          </span>
                        </label>

                        {row && (
                          <div className="flex flex-wrap items-center gap-2">
                            <TrackPicker
                              value={row.applies_to}
                              onChange={(next) =>
                                upsert.mutate({
                                  doc_slug: row.doc_slug,
                                  applies_to: next,
                                  is_required: row.is_required,
                                  sort_order: row.sort_order,
                                })
                              }
                            />
                            <button
                              type="button"
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                                row.is_required
                                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                                  : 'border-cream-300 text-ink-500'
                              }`}
                              onClick={() =>
                                upsert.mutate({
                                  doc_slug: row.doc_slug,
                                  applies_to: row.applies_to,
                                  is_required: !row.is_required,
                                  sort_order: row.sort_order,
                                })
                              }
                            >
                              {row.is_required ? 'Required' : 'Optional'}
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// --------------------------------------------------------- steps & reminders

function StepsSection() {
  const { data: settings } = useOnboardingSettings()
  const update = useUpdateOnboardingSettings()

  const [steps, setSteps] = useState<OnboardingStep[]>([])
  const [reminderDays, setReminderDays] = useState('')
  const [notifyOnComplete, setNotifyOnComplete] = useState(true)

  useEffect(() => {
    if (!settings) return
    setSteps(settings.steps)
    setReminderDays(settings.reminder_days.join(', '))
    setNotifyOnComplete(settings.notify_on_complete)
  }, [settings])

  if (!settings) return null

  /** Free text in, sorted unique positive integers out — so "7, 3, 1, 3, oops"
   *  becomes {1,3,7} rather than a validation error the admin has to fight. */
  const parsedDays = Array.from(
    new Set(
      reminderDays
        .split(/[,\s]+/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ).sort((a, b) => a - b)

  const dirty =
    JSON.stringify(steps) !== JSON.stringify(settings.steps) ||
    JSON.stringify(parsedDays) !== JSON.stringify(settings.reminder_days) ||
    notifyOnComplete !== settings.notify_on_complete

  function patchStep(key: string, patch: Partial<OnboardingStep>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  return (
    <Section
      icon={<ListChecks size={16} />}
      tone="bg-violet-50 text-violet-700"
      title="Steps and reminders"
      description="Which screens each track sees, and how often we chase an unfinished one"
      actions={
        <button
          className="btn-primary !py-1.5 !px-3 text-sm"
          disabled={!dirty || update.isPending}
          onClick={() =>
            update.mutate({
              steps,
              reminder_days: parsedDays,
              notify_on_complete: notifyOnComplete,
            })
          }
        >
          <Check size={15} /> Save
        </button>
      }
    >
      <ul className="divide-y divide-cream-200">
        {steps.map((step) => (
          <li key={step.key} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${step.enabled ? 'text-ink-900' : 'text-ink-400'}`}>
                {step.label}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">{step.key}</p>
            </div>
            <TrackPicker
              value={step.applies_to}
              disabled={!step.enabled}
              onChange={(next) => patchStep(step.key, { applies_to: next })}
            />
            <button
              type="button"
              disabled={!step.enabled}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                step.required
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-cream-300 text-ink-500'
              }`}
              onClick={() => patchStep(step.key, { required: !step.required })}
            >
              {step.required ? 'Required' : 'Optional'}
            </button>
            <button
              type="button"
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                step.enabled ? 'border-cream-300 text-ink-600' : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
              onClick={() => patchStep(step.key, { enabled: !step.enabled })}
            >
              {step.enabled ? 'On' : 'Off'}
            </button>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 border-t border-cream-200 pt-4 sm:grid-cols-2">
        <div>
          <label className="label">Remind after (days)</label>
          <input
            className="input"
            value={reminderDays}
            onChange={(e) => setReminderDays(e.target.value)}
            placeholder="1, 3, 7"
          />
          <p className="mt-1 text-xs text-ink-500">
            {parsedDays.length === 0
              ? 'Empty means no reminders.'
              : `Reminders on day ${parsedDays.join(', ')} after the invite.`}
          </p>
        </div>
        <div className="self-end">
          <Toggle
            checked={notifyOnComplete}
            onChange={setNotifyOnComplete}
            label="Tell HR and their workstream lead when someone finishes"
          />
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------- tab

/** Gated to admin / executive / HR, matching is_admin_exec_or_hr() in Postgres.
 *  The nav link and the route gate hide this already; the check here is what
 *  makes that cosmetic rather than load-bearing. */
export function OnboardingSettingsTab() {
  const { isAdmin, isExecutive, isHR } = useAuth()
  const { data: settings, isLoading } = useOnboardingSettings()

  if (!(isAdmin || isExecutive || isHR)) {
    return <EmptyState title="Only admins, executives and HR can configure onboarding." />
  }
  if (isLoading) return <Spinner />
  if (!settings) {
    return (
      <EmptyState
        title="Onboarding isn't set up for this workspace yet."
        hint="Every workspace should have a settings row. If this persists, the onboarding migrations may not have run."
      />
    )
  }

  return (
    <div className="space-y-4">
      <WelcomeSection />
      <AgreementsSection />
      <ReadingSection />
      <StepsSection />
    </div>
  )
}
