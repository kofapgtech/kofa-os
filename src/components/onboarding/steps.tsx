import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MutableRefObject,
} from 'react'
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  KeyRound,
  PlayCircle,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import {
  useCompleteOnboardingStep,
  useDepartmentLeads,
  useDepartments,
  useProfiles,
  useSignOnboardingAgreement,
  useUpdateProfile,
} from '@/lib/queries'
import { Avatar, Spinner } from '@/components/ui'
import { Markdown } from '@/components/docs/Markdown'
import type { OnboardingPlan, PlanReadingItem } from '@/lib/onboarding'
import {
  fillAndFlatten,
  meaningfulValues,
  missingRequired,
  type PdfField,
  type PdfFieldValues,
} from '@/lib/pdfForm'
import { PdfFormFiller } from './PdfFormFiller'
import type { OnboardingAgreement } from '@/lib/types'

/** Every step gets the same heading treatment, so the wizard reads as one
 *  document rather than four screens that happen to follow each other. */
export function StepHeading({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold text-ink-900">{title}</h2>
      {blurb && <p className="mt-1 text-sm text-ink-500">{blurb}</p>}
    </div>
  )
}

// ------------------------------------------------------------------- welcome

function PersonCard({ label, person }: { label: string; person: { full_name: string; title: string | null; email: string; avatar_url: string | null } }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-cream-200 p-3">
      <Avatar name={person.full_name} avatarUrl={person.avatar_url} size={40} />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
        <p className="truncate text-sm font-medium text-ink-900">{person.full_name}</p>
        <p className="truncate text-xs text-ink-500">{person.title ?? person.email}</p>
      </div>
    </div>
  )
}

/** The people a new hire will actually need in week one, resolved from the
 *  roster rather than configured by hand — a hardcoded "your HR contact" goes
 *  stale the first time someone changes job. */
export function WelcomeStep({ plan }: { plan: OnboardingPlan }) {
  const { profile } = useAuth()
  const { data: people = [] } = useProfiles()
  const { data: departments = [] } = useDepartments()
  const { data: leads = [] } = useDepartmentLeads()

  const department = departments.find((d) => d.id === profile?.department_id)

  const myLeads = useMemo(() => {
    if (!profile?.department_id) return []
    const leadIds = new Set(
      leads.filter((l) => l.department_id === profile.department_id).map((l) => l.profile_id),
    )
    return people.filter((p) => leadIds.has(p.user_id) && p.user_id !== profile.user_id)
  }, [leads, people, profile])

  const hr = people.filter((p) => p.role === 'hr_manager' && p.user_id !== profile?.user_id).slice(0, 1)
  const execs = people.filter((p) => p.role === 'executive' && p.user_id !== profile?.user_id).slice(0, 1)

  return (
    <div>
      <StepHeading
        title={plan.welcomeTitle}
        blurb={department ? `You've been added to ${department.name}.` : undefined}
      />

      {plan.welcomeBody.trim() ? (
        <div className="rounded-xl border border-cream-200 bg-white p-4">
          <Markdown body={plan.welcomeBody} />
        </div>
      ) : null}

      {plan.welcomeVideoUrl && (
        <a
          href={plan.welcomeVideoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost mt-3 w-full justify-center"
        >
          <PlayCircle size={16} /> Watch the welcome video
          <ExternalLink size={13} className="text-ink-400" />
        </a>
      )}

      {(myLeads.length > 0 || hr.length > 0 || execs.length > 0) && (
        <>
          <p className="label mt-6">Who to ask</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {myLeads.map((p) => (
              <PersonCard key={p.user_id} label="Your workstream lead" person={p} />
            ))}
            {hr.map((p) => (
              <PersonCard key={p.user_id} label="People and HR" person={p} />
            ))}
            {execs.map((p) => (
              <PersonCard key={p.user_id} label="Managing director" person={p} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------- account

/** The full IANA list where the browser has it, which is everywhere modern,
 *  and a short sensible list where it doesn't. Either way the person's own
 *  detected zone is preselected, so the common case is leaving it alone. */
function useTimezones(): string[] {
  return useMemo(() => {
    try {
      const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
        .supportedValuesOf?.('timeZone')
      if (supported?.length) return supported
    } catch {
      // Older engine — fall through to the short list.
    }
    return [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Africa/Lagos',
      'Africa/Johannesburg',
      'Asia/Dubai',
      'Asia/Kolkata',
      'Asia/Singapore',
      'Australia/Sydney',
      'UTC',
    ]
  }, [])
}

export function AccountStep({
  onValidityChange,
  saveRef,
}: {
  onValidityChange: (ok: boolean) => void
  /** The shell calls this on "Continue". Assigned fresh on every render rather
   *  than registered in an effect, so it always closes over the current field
   *  values -- an effect-registered callback would save whatever the fields
   *  held when its dependencies last changed. */
  saveRef: MutableRefObject<(() => Promise<void>) | null>
}) {
  const { profile, user, updatePassword, refreshProfile } = useAuth()
  const update = useUpdateProfile()
  const timezones = useTimezones()

  // Someone who arrived through Google already has a working credential, and
  // forcing a password on them would add one they'd never use. Identities is
  // the honest signal — app_metadata.provider only reports the most recent.
  const hasPasswordIdentity = !!user?.identities?.some((i) => i.provider === 'email')
  const googleOnly = !hasPasswordIdentity

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [preferredName, setPreferredName] = useState(profile?.preferred_name ?? '')
  const [title, setTitle] = useState(profile?.title ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [timezone, setTimezone] = useState(
    profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'America/New_York',
  )
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwSet, setPwSet] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwBusy, setPwBusy] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  // The name is the only hard requirement. A password is required unless they
  // came in through Google; everything else is genuinely optional, and marking
  // optional fields as blockers is how a ten-minute flow becomes abandoned.
  const passwordSatisfied = googleOnly || pwSet || (!!password && password.length >= 8 && password === confirm)
  const valid = !!fullName.trim() && passwordSatisfied
  useEffect(() => onValidityChange(valid), [valid, onValidityChange])

  async function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile) return
    setUploading(true)
    setAvatarError(null)
    try {
      // Same fixed path + upsert as the Profile page, so the two screens can't
      // leave two competing avatar objects behind for one person.
      const path = `${profile.user_id}/avatar`
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await update.mutateAsync({
        id: profile.user_id,
        patch: { avatar_url: `${data.publicUrl}?v=${Date.now()}` },
      })
      await refreshProfile()
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function savePassword() {
    setPwError(null)
    if (password.length < 8) return setPwError('Use at least 8 characters.')
    if (password !== confirm) return setPwError("Passwords don't match.")
    setPwBusy(true)
    const { error } = await updatePassword(password)
    setPwBusy(false)
    if (error) return setPwError(error)
    setPassword('')
    setConfirm('')
    setPwSet(true)
  }

  // Runs when the shell advances. Separate from the password save above
  // because that one goes to the auth service, not to profiles.
  saveRef.current = async () => {
    if (!profile) return
    await update.mutateAsync({
      id: profile.user_id,
      patch: {
        full_name: fullName.trim(),
        preferred_name: preferredName.trim() || null,
        title: title.trim() || null,
        phone: phone.trim() || null,
        timezone,
      },
    })
    await refreshProfile()
  }

  return (
    <div>
      <StepHeading
        title="Your account"
        blurb="Check what we have on file, and secure the account while you're here."
      />

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <Avatar name={fullName || profile?.full_name} avatarUrl={profile?.avatar_url} size={64} />
            <button
              type="button"
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-cream-300 bg-white text-ink-600 hover:text-brand-700 disabled:opacity-50"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              title="Add a photo"
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
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900">Add a photo</p>
            <p className="text-xs text-ink-500">
              Optional, but it makes you easier to spot on boards and approval queues.
            </p>
            {avatarError && <p className="mt-1 text-xs text-rose-600">{avatarError}</p>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Full name</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="label">Goes by (optional)</label>
            <input
              className="input"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              placeholder={fullName.split(' ')[0] || 'Preferred name'}
            />
          </div>
          <div>
            <label className="label">Job title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Phone (optional)</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Time zone</label>
          <select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {timezones.includes(timezone) ? null : <option value={timezone}>{timezone}</option>}
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-500">
            Used for the day boundaries on your timesheet, so it's worth getting right.
          </p>
        </div>

        <div className="rounded-xl border border-cream-200 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <KeyRound size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-900">
                {googleOnly ? 'Signing in with Google' : 'Set a password'}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {googleOnly
                  ? "You signed in with your Google work account, so there's no password to set. Keep using the Google button."
                  : 'You arrived on a one-time link. Set a password so you can sign in again on your own.'}
              </p>

              {!googleOnly && !pwSet && (
                <div className="mt-3 max-w-sm space-y-2">
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                  <input
                    className="input"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Confirm password"
                  />
                  {pwError && <p className="text-xs text-rose-600">{pwError}</p>}
                  <button
                    type="button"
                    className="btn-primary !py-1.5 !px-3 text-sm"
                    disabled={pwBusy || !password}
                    onClick={() => void savePassword()}
                  >
                    <Check size={15} /> Save password
                  </button>
                </div>
              )}

              {pwSet && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-700">
                  <CheckCircle2 size={14} /> Password set.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- agreements

function AgreementReader({
  agreement,
  onBack,
  onSigned,
}: {
  agreement: OnboardingAgreement
  onBack: () => void
  onSigned: () => void
}) {
  const { profile } = useAuth()
  const sign = useSignOnboardingAgreement()
  const [typedName, setTypedName] = useState('')
  const [scrolledToEnd, setScrolledToEnd] = useState(agreement.source === 'file')
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)

  // A fillable PDF is handled by us, not by the browser's viewer: the values
  // have to come back out, and nothing typed inside an <iframe> ever can.
  const fillable = agreement.source === 'file' && agreement.form_field_count > 0
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [fields, setFields] = useState<PdfField[]>([])
  const [values, setValues] = useState<PdfFieldValues>({})
  const [signError, setSignError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Signed URLs are short-lived by design; an hour comfortably covers reading
  // a contract without leaving a shareable link lying around afterwards.
  useEffect(() => {
    if (agreement.source !== 'file' || !agreement.file_path) return
    let alive = true
    void supabase.storage
      .from('onboarding-docs')
      .createSignedUrl(agreement.file_path, 3600)
      .then(({ data, error }) => {
        if (!alive) return
        if (error || !data?.signedUrl) setUrlError(error?.message ?? "Couldn't open the document.")
        else setSignedUrl(data.signedUrl)
      })
    return () => {
      alive = false
    }
  }, [agreement])

  // Fetched through the signed URL rather than download() so the bytes and the
  // iframe fallback come from exactly the same object.
  useEffect(() => {
    if (!fillable || !signedUrl) return
    let alive = true
    void fetch(signedUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`Could not download the document (${r.status}).`)
        return r.arrayBuffer()
      })
      .then((b) => {
        if (alive) setBytes(b)
      })
      .catch((err: Error) => {
        if (alive) setUrlError(err.message)
      })
    return () => {
      alive = false
    }
  }, [fillable, signedUrl])

  const onFieldsRead = useCallback((read: PdfField[]) => {
    setFields(read)
    // Seed from whatever the document already contains, so a pre-filled company
    // name stays put instead of being blanked by the first edit.
    setValues((prev) => {
      const seeded: PdfFieldValues = {}
      for (const f of read) if (f.initial) seeded[f.name] = f.initial
      return { ...seeded, ...prev }
    })
  }, [])

  const blanks = fillable ? missingRequired(fields, values) : []
  const expectedName = (profile?.full_name ?? '').trim().toLowerCase()
  const nameMatches = typedName.trim().toLowerCase() === expectedName && expectedName.length > 0
  const canSign =
    nameMatches &&
    scrolledToEnd &&
    blanks.length === 0 &&
    !sign.isPending &&
    !submitting &&
    (!fillable || !!bytes)

  /**
   * Fill, flatten, upload, then record.
   *
   * In that order on purpose: the signature row is the thing that makes the
   * agreement count as signed, so it is written last, once there is a file to
   * point at. If the upload fails we still record the signature with the
   * answers in `field_values` and a null path -- losing a completed form
   * because storage hiccuped would be far worse than holding a record whose
   * PDF copy is missing.
   */
  async function submitSignature() {
    if (!profile) return
    setSignError(null)
    setSubmitting(true)
    try {
      let filledFilePath: string | null = null
      let filledFlattened: boolean | null = null

      if (fillable && bytes) {
        const signedAt = new Date()
        const { bytes: out, flattened } = await fillAndFlatten(bytes.slice(0), values, {
          signatureText: typedName.trim(),
          signedAtText: `Signed ${signedAt.toISOString().slice(0, 10)} via Kofa OS`,
        })
        filledFlattened = flattened
        // The timestamp keeps a retry after a failed insert from colliding with
        // the attempt before it -- there is no update policy on this path.
        const key = `${profile.org_id}/signed/${profile.user_id}/${agreement.id}-v${agreement.version}-${signedAt.getTime()}.pdf`
        const { error } = await supabase.storage
          .from('onboarding-docs')
          .upload(key, new Blob([out as BlobPart], { type: 'application/pdf' }), {
            contentType: 'application/pdf',
            upsert: false,
          })
        if (!error) filledFilePath = key
      }

      await sign.mutateAsync({
        ...agreement,
        typedName: typedName.trim(),
        fieldValues: fillable ? meaningfulValues(fields, values) : {},
        filledFilePath,
        filledFlattened,
      })
      onSigned()
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Could not complete signing.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <button type="button" className="btn-ghost !py-1.5 !px-2.5 mb-4 text-sm" onClick={onBack}>
        <ArrowLeft size={15} /> All documents
      </button>

      <StepHeading title={agreement.title} blurb={agreement.summary ?? undefined} />

      {fillable ? (
        urlError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {urlError}
          </p>
        ) : bytes ? (
          <PdfFormFiller
            bytes={bytes}
            values={values}
            onChange={setValues}
            onFieldsRead={onFieldsRead}
            disabled={submitting}
          />
        ) : (
          <div className="rounded-xl border border-cream-200 p-6">
            <Spinner label="Opening document" />
          </div>
        )
      ) : agreement.source === 'file' ? (
        <div className="overflow-hidden rounded-xl border border-cream-200">
          {urlError ? (
            <p className="p-4 text-sm text-rose-600">{urlError}</p>
          ) : signedUrl ? (
            <iframe src={signedUrl} title={agreement.title} className="h-[420px] w-full" />
          ) : (
            <div className="p-6">
              <Spinner label="Opening document" />
            </div>
          )}
          {signedUrl && (
            <div className="border-t border-cream-200 bg-cream-50 px-3 py-2">
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
              >
                <ExternalLink size={12} /> Open in a new tab
              </a>
            </div>
          )}
        </div>
      ) : (
        // The scroll listener is the only thing standing between "I agree" and
        // a document nobody opened. It is a nudge, not a proof -- but a person
        // who never reached the bottom genuinely did not read it.
        <div
          className="max-h-[420px] overflow-y-auto rounded-xl border border-cream-200 bg-white p-4"
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setScrolledToEnd(true)
          }}
        >
          <Markdown body={agreement.body_md ?? ''} />
        </div>
      )}

      <div className="mt-4 rounded-xl border border-cream-200 bg-cream-50 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-brand-600">
            <ShieldCheck size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">Sign</p>
            <p className="mt-0.5 text-xs text-ink-500">
              Type your full name exactly as it appears on your profile — {profile?.full_name} — to
              sign version {agreement.version}. We record your name, the time, and your device
              {fillable ? ', along with everything you filled in and a copy of the completed document' : ''}.
            </p>
            <div className="mt-3 max-w-sm">
              <input
                className="input"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Your full name"
              />
              {!scrolledToEnd && (
                <p className="mt-1.5 text-xs text-ink-500">Scroll to the end of the document first.</p>
              )}
              {blanks.length > 0 && (
                <p className="mt-1.5 text-xs text-amber-700">
                  {blanks.length} required {blanks.length === 1 ? 'field is' : 'fields are'} still
                  blank: {blanks.slice(0, 3).map((f) => f.name).join(', ')}
                  {blanks.length > 3 ? `, and ${blanks.length - 3} more` : ''}.
                </p>
              )}
              {signError && <p className="mt-1.5 text-xs text-rose-600">{signError}</p>}
              <button
                type="button"
                className="btn-primary mt-2"
                disabled={!canSign}
                onClick={() => void submitSignature()}
              >
                <Check size={16} />{' '}
                {submitting ? 'Saving…' : fillable ? 'Sign and save' : 'Sign and continue'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AgreementsStep({ plan }: { plan: OnboardingPlan }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = plan.agreements.find((a) => a.id === openId) ?? null

  if (open) {
    return (
      <AgreementReader
        agreement={open}
        onBack={() => setOpenId(null)}
        onSigned={() => setOpenId(null)}
      />
    )
  }

  if (plan.agreements.length === 0) {
    return (
      <div>
        <StepHeading title="Agreements" />
        <p className="rounded-xl border border-cream-200 bg-white p-4 text-sm text-ink-500">
          Nothing to sign — there are no documents set up for your engagement type yet.
        </p>
      </div>
    )
  }

  return (
    <div>
      <StepHeading
        title="Agreements"
        blurb="Read each document and sign it by typing your name."
      />
      <ul className="space-y-2">
        {plan.agreements.map((a) => {
          const signed = plan.signedAgreementIds.has(a.id)
          return (
            <li key={a.id}>
              <button
                type="button"
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  signed
                    ? 'border-brand-200 bg-brand-50/40'
                    : 'border-cream-200 hover:border-brand-300 hover:bg-cream-50'
                }`}
                onClick={() => setOpenId(a.id)}
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    signed ? 'bg-brand-600 text-white' : 'bg-cream-200 text-ink-500'
                  }`}
                >
                  {signed ? <Check size={16} /> : <FileText size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink-900">{a.title}</span>
                  <span className="block text-xs text-ink-500">
                    {signed ? 'Signed' : a.is_required ? 'Required' : 'Optional'}
                    {a.summary ? ` · ${a.summary}` : ''}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------------- reading

function ArticleReader({
  entry,
  onBack,
  onRead,
}: {
  entry: PlanReadingItem
  onBack: () => void
  onRead: () => void
}) {
  const complete = useCompleteOnboardingStep()
  return (
    <div>
      <button type="button" className="btn-ghost !py-1.5 !px-2.5 mb-4 text-sm" onClick={onBack}>
        <ArrowLeft size={15} /> All reading
      </button>
      <StepHeading title={entry.doc.title} blurb={entry.doc.summary} />
      <div className="max-h-[460px] overflow-y-auto rounded-xl border border-cream-200 bg-white p-4">
        <Markdown body={entry.doc.body} />
      </div>
      <button
        type="button"
        className="btn-primary mt-4"
        disabled={complete.isPending}
        onClick={async () => {
          await complete.mutateAsync({ stepKey: `reading:${entry.item.doc_slug}` })
          onRead()
        }}
      >
        <Check size={16} /> {entry.read ? 'Done' : "I've read this"}
      </button>
    </div>
  )
}

export function ReadingStep({ plan }: { plan: OnboardingPlan }) {
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const open = plan.reading.find((r) => r.item.doc_slug === openSlug) ?? null

  if (open) {
    return (
      <ArticleReader
        entry={open}
        onBack={() => setOpenSlug(null)}
        onRead={() => setOpenSlug(null)}
      />
    )
  }

  if (plan.reading.length === 0) {
    return (
      <div>
        <StepHeading title="Required reading" />
        <p className="rounded-xl border border-cream-200 bg-white p-4 text-sm text-ink-500">
          Nothing assigned yet. Help &amp; docs is always there in the sidebar when you want it.
        </p>
      </div>
    )
  }

  return (
    <div>
      <StepHeading
        title="Required reading"
        blurb="Short pages on how we work. Open each one and mark it read — you can come back to all of them later under Help & docs."
      />
      <ul className="space-y-2">
        {plan.reading.map((entry) => (
          <li key={entry.item.doc_slug}>
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                entry.read
                  ? 'border-brand-200 bg-brand-50/40'
                  : 'border-cream-200 hover:border-brand-300 hover:bg-cream-50'
              }`}
              onClick={() => setOpenSlug(entry.item.doc_slug)}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  entry.read ? 'bg-brand-600 text-white' : 'bg-cream-200 text-ink-500'
                }`}
              >
                {entry.read ? <Check size={16} /> : <FileText size={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-900">{entry.doc.title}</span>
                <span className="block text-xs text-ink-500">
                  {entry.read ? 'Read' : entry.item.is_required ? 'Required' : 'Optional'} ·{' '}
                  {entry.doc.section}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
