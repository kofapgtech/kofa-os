import { useEffect, useState, type ReactNode } from 'react'
import { Check, Globe, Landmark, Palette, RotateCcw, ShieldAlert, Trash2, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useAllProfiles,
  useDeleteWorkspace,
  useIsPlatformAdmin,
  useMyWorkspaces,
  useOrgEmailDomains,
  useProfiles,
  useResetWorkspace,
  useTransferOwnership,
  useUpdateWorkspace,
  useWorkspace,
} from '@/lib/queries'
import { ConfirmDialog, EmptyState, PageHeader, Spinner } from '@/components/ui'
import type { PayPeriodCadence } from '@/lib/types'

const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'NGN', 'ZAR']

const CADENCE_LABEL: Record<PayPeriodCadence, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  semi_monthly: 'Twice a month (1st–15th, 16th–end)',
  monthly: 'Monthly',
}

const BRAND_SWATCHES = ['#244A34', '#8A5A18', '#0B6E99', '#A81E36', '#3F3B33']

/** A section title with an icon badge and a one-line description — used for
 *  every card on this page so the settings read as a coherent group rather
 *  than a stack of unrelated forms. */
function SectionHeader({
  icon,
  tone,
  title,
  description,
}: {
  icon: ReactNode
  tone: string
  title: string
  description?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
      </div>
    </div>
  )
}

/**
 * Owner-or-platform-staff. Everything here is enforced in Postgres too — the
 * org_update policy checks is_workspace_owner() OR is_platform_admin(), and
 * the is_owner column can't be moved by a direct update at all, only through
 * transfer_workspace_ownership().
 */
export function WorkspaceSettings() {
  const { isOwner, profile } = useAuth()
  const { data: workspace, isLoading } = useWorkspace()
  const { data: domains = [] } = useOrgEmailDomains()
  const { data: people = [] } = useProfiles()
  const { data: allPeople = [] } = useAllProfiles()
  const { data: workspaces = [] } = useMyWorkspaces()
  const { data: isPlatformAdmin = false } = useIsPlatformAdmin()
  const update = useUpdateWorkspace()
  const transfer = useTransferOwnership()
  const deleteWorkspace = useDeleteWorkspace()
  const resetWorkspace = useResetWorkspace()

  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [brandColor, setBrandColor] = useState('#244A34')
  const [currency, setCurrency] = useState('USD')
  const [timezone, setTimezone] = useState('')
  const [weekStart, setWeekStart] = useState(1)
  const [cadence, setCadence] = useState<PayPeriodCadence>('semi_monthly')
  const [capacity, setCapacity] = useState('40')
  const [transferTo, setTransferTo] = useState('')
  const [confirmingTransfer, setConfirmingTransfer] = useState(false)
  const [deleteSlugInput, setDeleteSlugInput] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [resetSlugInput, setResetSlugInput] = useState('')
  const [wipeEmployees, setWipeEmployees] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [logoBroken, setLogoBroken] = useState(false)

  useEffect(() => {
    if (!workspace) return
    setName(workspace.name)
    setLogoUrl(workspace.logo_url ?? '')
    setBrandColor(workspace.brand_color)
    setCurrency(workspace.currency)
    setTimezone(workspace.timezone)
    setWeekStart(workspace.week_start)
    setCadence(workspace.pay_period_cadence)
    setCapacity(String(workspace.default_capacity_hours))
  }, [workspace])

  if (isLoading) return <Spinner />
  if (!isOwner && !isPlatformAdmin)
    return <EmptyState title="Only the workspace owner can change these settings." />
  if (!workspace) return <EmptyState title="Workspace not found." />

  const cadenceChanged = cadence !== workspace.pay_period_cadence
  const currencyChanged = currency !== workspace.currency

  function save() {
    update.mutate({
      id: workspace!.id,
      patch: {
        name: name.trim(),
        logo_url: logoUrl.trim() || null,
        brand_color: brandColor,
        currency,
        timezone: timezone.trim(),
        week_start: weekStart,
        pay_period_cadence: cadence,
        default_capacity_hours: Number(capacity) || 40,
      },
    })
  }

  const transferable = people.filter((p) => p.user_id !== profile?.user_id && p.is_active)

  // Gate: the acting owner must belong to another active workspace already —
  // this is about them never being left with nowhere to go, not a
  // platform-wide "don't delete the last workspace" rule.
  const canDelete = workspaces.length > 1
  const deleteConfirmed = deleteSlugInput.trim() === workspace.slug
  const resetConfirmed = resetSlugInput.trim() === workspace.slug

  // Exactly who reset_workspace(true) removes: everyone except the owner and
  // anyone with the Admin role. Computed the same way here as server-side so
  // the confirmation copy never overstates or understates the blast radius.
  const departingEmployees = allPeople.filter((p) => !(p.is_owner || p.role === 'admin'))

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Workspace"
        subtitle={`${workspace.name} · kofaos.app/w/${workspace.slug}`}
        actions={
          <button className="btn-primary" disabled={update.isPending} onClick={save}>
            <Check size={16} /> Save changes
          </button>
        }
      />

      <div className="space-y-4">
        <section className="card space-y-5 p-5">
          <SectionHeader
            icon={<Palette size={16} />}
            tone="bg-brand-50 text-brand-600"
            title="Identity"
            description="Name, address, and branding"
          />

          <div className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input bg-cream-100 text-ink-500" value={workspace.slug} readOnly />
              <p className="mt-1.5 text-xs text-ink-500">
                Fixed — it identifies the workspace, and changing it would break saved links.
              </p>
            </div>
            <div>
              <label className="label">Logo</label>
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-cream-300 bg-cream-100">
                  {logoUrl.trim() && !logoBroken ? (
                    <img
                      src={logoUrl.trim()}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setLogoBroken(true)}
                      onLoad={() => setLogoBroken(false)}
                    />
                  ) : (
                    <span
                      className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase text-ink-400"
                      style={{ background: `${brandColor}14` }}
                    >
                      {workspace.name.slice(0, 1)}
                    </span>
                  )}
                </div>
                <input
                  className="input"
                  value={logoUrl}
                  placeholder="https://…"
                  onChange={(e) => {
                    setLogoUrl(e.target.value)
                    setLogoBroken(false)
                  }}
                />
              </div>
            </div>
            <div>
              <label className="label">Brand colour</label>
              <div className="flex flex-wrap items-center gap-2">
                {BRAND_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Use ${c}`}
                    onClick={() => setBrandColor(c)}
                    style={{ background: c }}
                    className={`h-8 w-8 rounded-full ring-2 ring-offset-2 transition-shadow ${
                      brandColor.toLowerCase() === c.toLowerCase()
                        ? 'ring-ink-900'
                        : 'ring-transparent hover:ring-cream-400'
                    }`}
                  />
                ))}
                <span className="mx-1 h-6 w-px bg-cream-300" />
                <input
                  className="input !w-28 font-mono text-xs"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="card space-y-5 p-5">
          <SectionHeader
            icon={<Globe size={16} />}
            tone="bg-brand-50 text-brand-600"
            title="Locale & money"
            description="Currency, time zone, and default capacity"
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Currency</label>
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Time zone</label>
              <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </div>
            <div>
              <label className="label">Week starts</label>
              <select
                className="input"
                value={weekStart}
                onChange={(e) => setWeekStart(Number(e.target.value))}
              >
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </div>
            <div>
              <label className="label">Default capacity (h/week)</label>
              <input
                className="input"
                type="number"
                min="1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          </div>
          {currencyChanged && (
            <p className="flex items-start gap-2 rounded-xl bg-accent-50 px-3 py-2 text-xs text-accent-700">
              Changes the symbol on every rate, budget and payroll figure. It does not convert any
              stored amount — the numbers stay exactly as they are.
            </p>
          )}
        </section>

        <section className="card space-y-5 p-5">
          <SectionHeader
            icon={<Landmark size={16} />}
            tone="bg-brand-50 text-brand-600"
            title="Payroll"
            description="How pay periods are generated"
          />

          <div>
            <label className="label">Pay period cadence</label>
            <select
              className="input"
              value={cadence}
              onChange={(e) => setCadence(e.target.value as PayPeriodCadence)}
            >
              {(Object.keys(CADENCE_LABEL) as PayPeriodCadence[]).map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          {cadenceChanged && (
            <p className="flex items-start gap-2 rounded-xl bg-accent-50 px-3 py-2 text-xs text-accent-700">
              New periods in this shape are added going forward. Periods that already exist —
              including any that are locked or paid — are never rewritten or removed.
            </p>
          )}
        </section>

        <section className="card space-y-5 p-5">
          <SectionHeader
            icon={<ShieldAlert size={16} />}
            tone="bg-cream-200 text-ink-600"
            title="Access & ownership"
            description="Sign-in rules and who holds this workspace"
          />

          <div>
            <label className="label">Sign in without an invite</label>
            {domains.length === 0 ? (
              <p className="text-sm text-ink-500">Invite only — no domains are allow-listed.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {domains.map((d) => (
                  <span key={d.domain} className="chip bg-cream-200 text-ink-700">
                    {d.domain}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-ink-500">
              Anyone with an address at these domains is added to the roster as staff on first
              sign-in. Everyone else needs an invite.
            </p>
          </div>

          <div className="space-y-2 border-t border-cream-200 pt-4">
            <label className="label mb-0">Transfer ownership</label>
            <div className="flex gap-2">
              <select
                className="input"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
              >
                <option value="">Choose a member…</option>
                {transferable.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
              <button
                className="btn-danger shrink-0"
                disabled={!transferTo || transfer.isPending}
                onClick={() => setConfirmingTransfer(true)}
              >
                Transfer
              </button>
            </div>
            <p className="text-xs text-ink-500">
              They become owner and admin. You stay an admin, but lose this page.
            </p>
          </div>
        </section>
      </div>

      <section className="card mt-4 space-y-5 border-rose-200 bg-rose-50/40 p-5">
        <SectionHeader
          icon={<ShieldAlert size={16} />}
          tone="bg-rose-100 text-rose-600"
          title="Danger zone"
          description="Destructive, workspace-wide actions — read carefully before confirming"
        />

        <div className="space-y-3 rounded-xl border border-rose-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            <RotateCcw size={14} className="text-rose-600" /> Reset workspace
          </p>
          <p className="text-sm text-ink-600">
            Wipes every account, project, task, time entry, deliverable, budget, and payroll record
            in {workspace.name}. Your settings and everyone's membership stay exactly as they are —
            this clears the work, not the workspace. Nothing is purged right away, so there's a
            window to recover it if this was a mistake.
          </p>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-cream-300 bg-cream-50 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-cream-400"
              checked={wipeEmployees}
              onChange={(e) => setWipeEmployees(e.target.checked)}
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                <Users size={14} className="text-rose-600" /> Also remove every employee
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">
                Everyone's membership is removed except you and any other Admin —{' '}
                {departingEmployees.length === 0
                  ? 'nobody else is currently in this workspace'
                  : `${departingEmployees.length} ${departingEmployees.length === 1 ? 'person' : 'people'} right now`}
                . Their pay rates, workstream-lead tags, and attachments go with them. Workstreams
                themselves (Studio, PPC, …) are left in place.
              </span>
            </span>
          </label>

          <div>
            <label className="label">
              Type <span className="font-mono text-ink-700">{workspace.slug}</span> to confirm
            </label>
            <div className="flex gap-2">
              <input
                className="input"
                value={resetSlugInput}
                onChange={(e) => setResetSlugInput(e.target.value)}
                placeholder={workspace.slug}
              />
              <button
                className="btn-danger shrink-0"
                disabled={!resetConfirmed || resetWorkspace.isPending}
                onClick={() => setConfirmingReset(true)}
              >
                <RotateCcw size={16} /> {wipeEmployees ? 'Reset everything' : 'Reset workspace'}
              </button>
            </div>
          </div>
        </div>

        {canDelete && (
          <div className="space-y-3 rounded-xl border border-rose-200 bg-white p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <Trash2 size={14} className="text-rose-600" /> Delete workspace
            </p>
            <p className="text-sm text-ink-600">
              Deletes {workspace.name} for everyone in it. It stops appearing anywhere and no one can
              sign into it, but nothing is purged right away — that happens in a later cleanup step,
              so there's a window to recover it if this was a mistake.
            </p>
            <div>
              <label className="label">
                Type <span className="font-mono text-ink-700">{workspace.slug}</span> to confirm
              </label>
              <div className="flex gap-2">
                <input
                  className="input"
                  value={deleteSlugInput}
                  onChange={(e) => setDeleteSlugInput(e.target.value)}
                  placeholder={workspace.slug}
                />
                <button
                  className="btn-danger shrink-0"
                  disabled={!deleteConfirmed || deleteWorkspace.isPending}
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 size={16} /> Delete workspace
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {confirmingTransfer && (
        <ConfirmDialog
          title="Hand over this workspace?"
          message={`${
            transferable.find((p) => p.user_id === transferTo)?.full_name ?? 'They'
          } becomes the owner of ${workspace.name}. You keep admin access, but only they will be able to change these settings or transfer ownership again.`}
          busy={transfer.isPending}
          onConfirm={() => {
            setConfirmingTransfer(false)
            transfer.mutate(transferTo)
          }}
          onCancel={() => setConfirmingTransfer(false)}
        />
      )}

      {confirmingReset && (
        <ConfirmDialog
          title={wipeEmployees ? `Reset everything in ${workspace.name}?` : `Reset ${workspace.name}?`}
          message={
            wipeEmployees
              ? `Every account, project, task, time entry, deliverable, budget, and payroll record is wiped, and ${
                  departingEmployees.length === 0
                    ? 'so is'
                    : `so is ${departingEmployees.length} ${departingEmployees.length === 1 ? "person's" : "people's"}`
                } membership — their profile, pay rate, workstream-lead tags, and attachments. Only you and any other Admin keep access. Workstreams themselves stay. This can't be undone from here — recovering it means contacting support before the cleanup step runs.`
              : "Every account, project, task, time entry, deliverable, budget, and payroll record is wiped. Your settings and everyone's membership are untouched. This can't be undone from here — recovering it means contacting support before the cleanup step runs."
          }
          confirmLabel={wipeEmployees ? 'Reset everything' : 'Reset workspace'}
          busy={resetWorkspace.isPending}
          onConfirm={() => {
            setConfirmingReset(false)
            resetWorkspace.mutate(wipeEmployees, {
              onSuccess: () => window.location.assign('/'),
            })
          }}
          onCancel={() => setConfirmingReset(false)}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete ${workspace.name}?`}
          message="Everyone loses access immediately and it disappears from every switcher. This can't be undone from here — recovering it means contacting support before the cleanup step runs."
          confirmLabel="Delete workspace"
          busy={deleteWorkspace.isPending}
          onConfirm={() => {
            setConfirmingDelete(false)
            deleteWorkspace.mutate(undefined, {
              onSuccess: () => window.location.assign('/'),
            })
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
