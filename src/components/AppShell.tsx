import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Building2,
  CalendarClock,
  FileCheck2,
  Gauge,
  Landmark,
  LifeBuoy,
  ListChecks,
  LogOut,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useCreateWorkspace,
  useIsPlatformAdmin,
  useMyWorkspaces,
  useSetActiveWorkspace,
  useTimesheetWeeksRealtime,
  useWorkspace,
} from '@/lib/queries'
import { Modal, ModalHeader } from './ui'
import type { PayPeriodCadence } from '@/lib/types'
import { setWorkspaceCurrency } from '@/lib/format'
import { GlobalTimer } from './GlobalTimer'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import { Avatar } from './ui'

type NavGate =
  | 'leadership'
  | 'payroll'
  | 'admin'
  | 'admin-full'
  | 'workstreams'
  | 'timesheet-approvals'
  | 'non-contractor'
  | null

interface NavItem {
  to: string
  label: string
  icon: typeof ListChecks
  end?: boolean
  gate?: NavGate
  children?: { to: string; label: string; gate?: NavGate; end?: boolean }[]
}

const NAV: NavItem[] = [
  { to: '/', label: 'My work', icon: ListChecks, end: true },
  { to: '/command', label: 'Command centre', icon: Gauge, gate: 'leadership' },
  { to: '/projects', label: 'Projects', icon: Wallet },
  { to: '/deliverables', label: 'Deliverables', icon: FileCheck2 },
  {
    to: '/timesheet',
    label: 'Timesheet',
    icon: CalendarClock,
    children: [
      { to: '/timesheet', label: 'My timesheet', end: true },
      { to: '/timesheet/approvals', label: 'Approvals', gate: 'timesheet-approvals' },
    ],
  },
  { to: '/accounts', label: 'Accounts', icon: Building2, gate: 'non-contractor' },
  {
    to: '/payroll',
    label: 'Payroll',
    icon: Landmark,
    gate: 'payroll',
    children: [
      { to: '/payroll/payment', label: 'Payment' },
      { to: '/payroll/records', label: 'Records' },
    ],
  },
  {
    to: '/admin',
    label: 'Admin',
    icon: ShieldCheck,
    gate: 'admin',
    children: [
      { to: '/admin/employees', label: 'Employees' },
      { to: '/admin/workstreams', label: 'Workstreams', gate: 'workstreams' },
    ],
  },
]

/** The workspace menu in the header. Holds switching, settings and creation —
 *  which is why it is worth showing even to someone with a single workspace,
 *  as long as they can act on it.
 *
 *  Hidden entirely for a single-workspace member who is neither an owner nor
 *  platform staff: every item inside would be gated off, so the control would
 *  be a dead end. Note the list itself never leaks — my_workspaces() returns
 *  only workspaces you hold an active membership in.
 *
 *  Switching does a full page load rather than just clearing the query cache:
 *  every context in the tree (auth profile, notifications feed, running timer)
 *  is workspace-scoped, and a reload is the one thing guaranteed to rebuild
 *  all of them consistently. */
function WorkspaceMenu() {
  const { isOwner } = useAuth()
  const navigate = useNavigate()
  const { data: workspaces = [] } = useMyWorkspaces()
  const { data: isPlatformAdmin = false } = useIsPlatformAdmin()
  const switchTo = useSetActiveWorkspace()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const canCreate = isOwner || isPlatformAdmin
  // Platform staff act with owner-equivalent authority in every workspace
  // (see platform_admin_acts_as_owner migration) — the menu item follows.
  const canManageSettings = isOwner || isPlatformAdmin
  const hasSomethingToDo = workspaces.length > 1 || canManageSettings || canCreate
  if (!hasSomethingToDo) return null

  const current = workspaces.find((w) => w.is_current)

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-sm text-cream-50 hover:bg-white/20"
        >
          {current?.name ?? 'Workspace'}
          <span className="text-[10px] opacity-70">▼</span>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 z-50 mt-1.5 w-64 rounded-xl border border-cream-300 bg-white p-1.5 shadow-lg">
              {workspaces.length > 1 && (
                <>
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                    Your workspaces
                  </p>
                  {workspaces.map((w) => (
                    <button
                      key={w.org_id}
                      type="button"
                      disabled={switchTo.isPending}
                      onClick={() => {
                        if (w.is_current) return setOpen(false)
                        switchTo.mutate(w.org_id, { onSuccess: () => window.location.assign('/') })
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-800 hover:bg-cream-200 disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {w.name}
                        <span className="block text-xs text-ink-500">{w.role.replace('_', ' ')}</span>
                      </span>
                      {w.is_current && <span className="text-brand-600">✓</span>}
                    </button>
                  ))}
                  <div className="my-1.5 border-t border-cream-300" />
                </>
              )}

              {canManageSettings && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    navigate('/settings')
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-800 hover:bg-cream-200"
                >
                  <Settings size={15} className="text-ink-500" /> Workspace settings
                </button>
              )}

              {canCreate && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setCreating(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-800 hover:bg-cream-200"
                >
                  <Plus size={15} className="text-ink-500" /> Create new workspace
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {creating && <CreateWorkspaceModal onClose={() => setCreating(false)} />}
    </>
  )
}

const CADENCES: { value: PayPeriodCadence; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every two weeks' },
  { value: 'semi_monthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Monthly' },
]

/** Creating a workspace makes you its owner and switches you into it, so this
 *  reloads on success rather than trying to reconcile the caches in place. */
function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const create = useCreateWorkspace()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [currency, setCurrency] = useState('USD')
  const [timezone, setTimezone] = useState('America/New_York')
  const [cadence, setCadence] = useState<PayPeriodCadence>('semi_monthly')

  function onName(v: string) {
    setName(v)
    if (!slugEdited) {
      setSlug(v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        title="Create a workspace"
        icon={<Plus size={16} className="text-brand-600" />}
        onClose={onClose}
      />
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            placeholder="Rue Marketing"
            onChange={(e) => onName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Address</label>
          <input
            className="input font-mono text-sm"
            value={slug}
            onChange={(e) => {
              setSlugEdited(true)
              setSlug(e.target.value)
            }}
          />
          <p className="mt-1 text-xs text-ink-500">Must be unique. Can't be changed later.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Currency</label>
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'NGN', 'ZAR'].map((c) => (
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
        </div>
        <div>
          <label className="label">Pay period cadence</label>
          <select
            className="input"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as PayPeriodCadence)}
          >
            {CADENCES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <p className="rounded-lg bg-cream-200 px-3 py-2 text-xs text-ink-600">
          Sets up six workstreams, an internal account for its own work, and a pay period
          calendar. You become its owner and land inside it — use the workspace menu to come back.
        </p>

        <button
          className="btn-primary w-full"
          disabled={!name.trim() || !slug.trim() || create.isPending}
          onClick={() =>
            create.mutate(
              { name: name.trim(), slug: slug.trim(), currency, timezone, cadence },
              { onSuccess: () => window.location.assign('/') },
            )
          }
        >
          <Plus size={16} /> Create workspace
        </button>
      </div>
    </Modal>
  )
}

export function AppShell() {
  const {
    profile,
    signOut,
    isLeadership,
    isAdmin,
    isAdminOrExecutive,
    isExecutive,
    isHR,
    isPayrollAdmin,
    isContractor,
    canManageWorkstreams,
  } = useAuth()
  const navigate = useNavigate()
  const [mobileNav, setMobileNav] = useState(false)

  // Currency is a workspace setting. Applied here, in render, rather than in an
  // effect: money() is called while children render, and an effect would show
  // one frame of the wrong symbol on every load. setWorkspaceCurrency is a
  // no-op when nothing changed.
  const { data: workspace } = useWorkspace()
  setWorkspaceCurrency(workspace?.currency)

  // One realtime subscription for the whole authenticated shell, so a
  // timesheet approval on one screen updates every other open screen
  // (Timesheet, Approvals, Payroll) without a reload.
  useTimesheetWeeksRealtime()

  // "Admin" covers three audiences now: full admin/executive access, or
  // HR's narrower roster-only slice of the same section (see
  // AdminEmployees.tsx). Workstreams is its own gate again — admin,
  // executive and HR all manage the org chart.
  const canReachAdmin = isAdmin || isExecutive || isHR

  function passesGate(gate: NavGate) {
    if (gate === 'leadership') return isLeadership
    if (gate === 'payroll') return isPayrollAdmin
    if (gate === 'admin') return canReachAdmin
    if (gate === 'admin-full') return isAdminOrExecutive
    if (gate === 'workstreams') return canManageWorkstreams
    // Leads confirm their workstream's hours, the MD clears them, finance
    // needs to see where a week has got to before it can pay it.
    if (gate === 'timesheet-approvals') return isLeadership || isPayrollAdmin
    // Accounts is the client-commercial view of the workspace. Contractors are
    // staffed onto projects, not onto the client relationship, so they don't
    // see it — whatever role they hold. The route is closed to match
    // (see App.tsx), so this isn't only a hidden link.
    if (gate === 'non-contractor') return !isContractor
    return true
  }

  const links = NAV.filter((item) => passesGate(item.gate ?? null))
    .map((item) =>
      item.children ? { ...item, children: item.children.filter((c) => passesGate(c.gate ?? null)) } : item,
    )

  const nav = (
    <nav className="space-y-0.5">
      {links.map(({ to, label, icon: Icon, end, children }) =>
        children ? (
          <div key={to} className="pt-1">
            <p className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-ink-500">
              <Icon size={17} />
              {label}
            </p>
            <div className="ml-4 space-y-0.5 border-l border-cream-300 pl-3">
              {children.map((child) => (
                <NavLink
                  key={child.to}
                  to={child.to}
                  end={child.end}
                  onClick={() => setMobileNav(false)}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-cream-200'
                    }`
                  }
                >
                  {child.label}
                </NavLink>
              ))}
            </div>
          </div>
        ) : (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileNav(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-cream-200'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ),
      )}
    </nav>
  )

  /** Pinned to the bottom of the sidebar rather than sitting in NAV, because
   *  it is the one thing on this screen everyone in the company needs and it
   *  should not drift down the list as sections are added. Admins get the
   *  queue; everyone else gets the form and their own history. */
  const ticketCta = isAdmin ? (
    <NavLink
      to="/tickets/manage"
      onClick={() => setMobileNav(false)}
      className={({ isActive }) =>
        `flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
          isActive ? 'bg-brand-700 text-white' : 'bg-brand-600 text-white hover:bg-brand-700'
        }`
      }
    >
      <LifeBuoy size={17} />
      Manage tickets
    </NavLink>
  ) : (
    <NavLink
      to="/tickets"
      onClick={() => setMobileNav(false)}
      className={({ isActive }) =>
        `flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
          isActive ? 'bg-brand-700 text-white' : 'bg-brand-600 text-white hover:bg-brand-700'
        }`
      }
    >
      <LifeBuoy size={17} />
      Submit a ticket
    </NavLink>
  )

  return (
    <div className="min-h-screen bg-cream-100">
      {/* Forest-green bar, mirroring the kofapg.com nav. */}
      <header className="sticky top-0 z-30 bg-brand-700">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
          <button className="btn-onbrand !px-2.5 lg:hidden" onClick={() => setMobileNav(true)}>
            <Menu size={18} />
          </button>

          <Logo height={30} />
          <WorkspaceMenu />

          <div className="ml-auto flex items-center gap-2">
            <GlobalTimer />
            <NotificationBell />
            <Link
              to="/profile"
              className="hidden items-center gap-2 rounded-lg pl-2 pr-2 py-1 sm:flex hover:bg-white/10"
            >
              <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} onBrand />
              <div className="leading-tight text-left">
                <p className="text-sm font-medium text-cream-50">{profile?.full_name}</p>
                <p className="text-xs text-cream-200/70">{profile?.title}</p>
              </div>
            </Link>
            <button
              className="btn-onbrand !px-2.5"
              title="Sign out"
              onClick={async () => {
                await signOut()
                navigate('/login')
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Full width: the sidebar hugs the left edge so it lines up with the
          header, which has never been width-capped. */}
      <div className="flex">
        {/* Static: pinned under the 4rem header and scrolling in its own right,
            so the nav (and the ticket button at its foot) stay put however far
            the page behind them scrolls. */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col border-r border-cream-300 bg-white p-3 lg:flex">
          <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
          <div className="mt-3 shrink-0 border-t border-cream-300 pt-3">{ticketCta}</div>
        </aside>

        {mobileNav && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-brand-800/40" onClick={() => setMobileNav(false)} />
            <div className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white p-3">
              <div className="mb-3 flex justify-end">
                <button className="btn-ghost !px-2.5" onClick={() => setMobileNav(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
              <div className="mt-3 shrink-0 border-t border-cream-300 pt-3">{ticketCta}</div>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
