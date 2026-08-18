import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Building2,
  CalendarClock,
  FileCheck2,
  Gauge,
  ListChecks,
  LogOut,
  Menu,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { GlobalTimer } from './GlobalTimer'
import { Logo } from './Logo'
import { NotificationBell, NotificationToasts } from './NotificationBell'
import { Avatar } from './ui'

const NAV = [
  { to: '/', label: 'My work', icon: ListChecks, end: true },
  { to: '/command', label: 'Command centre', icon: Gauge, leadershipOnly: true },
  { to: '/projects', label: 'Projects', icon: Wallet },
  { to: '/deliverables', label: 'Deliverables', icon: FileCheck2 },
  { to: '/timesheet', label: 'Timesheet', icon: CalendarClock },
  { to: '/accounts', label: 'Accounts', icon: Building2 },
]

export function AppShell() {
  const { profile, signOut, isLeadership } = useAuth()
  const navigate = useNavigate()
  const [mobileNav, setMobileNav] = useState(false)

  const links = NAV.filter((item) => !item.leadershipOnly || isLeadership)

  const nav = (
    <nav className="space-y-0.5">
      {links.map(({ to, label, icon: Icon, end }) => (
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
      ))}
    </nav>
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

          <div className="ml-auto flex items-center gap-2">
            <GlobalTimer />
            <NotificationBell />
            <div className="hidden items-center gap-2 pl-2 sm:flex">
              <Avatar name={profile?.full_name} onBrand />
              <div className="leading-tight">
                <p className="text-sm font-medium text-cream-50">{profile?.full_name}</p>
                <p className="text-xs text-cream-200/70">{profile?.title}</p>
              </div>
            </div>
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
        <aside className="hidden w-60 shrink-0 border-r border-cream-300 bg-white p-3 lg:block min-h-[calc(100vh-4rem)]">
          {nav}
        </aside>

        {mobileNav && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-brand-800/40" onClick={() => setMobileNav(false)} />
            <div className="absolute left-0 top-0 h-full w-64 bg-white p-3">
              <div className="mb-3 flex justify-end">
                <button className="btn-ghost !px-2.5" onClick={() => setMobileNav(false)}>
                  <X size={18} />
                </button>
              </div>
              {nav}
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <NotificationToasts />
    </div>
  )
}
