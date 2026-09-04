import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Loader2, LogIn, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Logo } from '@/components/Logo'

/** Google's official four-color "G" mark -- lucide-react has no brand icons. */
function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.98v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.98a9 9 0 0 0 0 8.08l2.99-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.96l2.99 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

const DEMO_LOGINS = [
  { label: 'Jared Lewis — Admin', email: 'jared@kofapg.com', note: 'Sees money, capacity, everything' },
  { label: 'Jordan Ellis — Executive', email: 'jordan@kofapg.com', note: 'Everything Admin sees, except inviting employees' },
  { label: 'Talooka — Department lead', email: 'tomas@kofapg.com', note: 'Reviews deliverables, sees money' },
  { label: 'Adrienne — HR', email: 'priya.hr@kofapg.com', note: 'Invites & manages staff, plus every rate, budget number and Payroll' },
  { label: 'Elisee Mbaya — Staff', email: 'elisee@kofapg.com', note: 'No rates, no margin' },
]
const DEMO_PASSWORD = 'KofaDemo2026!'

export function Login() {
  const { session, signInWithPassword, signInWithMagicLink, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  // Google (or Supabase) can bounce back here with the failure in the URL --
  // e.g. an email outside the work domain, rejected by the
  // restrict_new_auth_users_to_org_domain DB trigger -- rather than as a
  // rejected promise, since the whole sign-in happened via redirect.
  useEffect(() => {
    const params = new URLSearchParams(
      window.location.hash ? window.location.hash.slice(1) : window.location.search,
    )
    const description = params.get('error_description')
    if (description) {
      setError(description.replace(/\+/g, ' '))
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  if (session) return <Navigate to="/" replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signInWithPassword(email, password)
    setBusy(false)
    if (error) setError(error)
    else navigate('/')
  }

  async function magicLink() {
    if (!email) return setError('Enter your work email first.')
    setBusy(true)
    setError(null)
    const { error } = await signInWithMagicLink(email)
    setBusy(false)
    if (error) setError(error)
    else setSent(true)
  }

  async function google() {
    setError(null)
    const { error } = await signInWithGoogle()
    if (error) setError(error)
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-700 p-10 lg:flex">
        <Logo height={34} />
        <div>
          <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-cream-50">
            Where the work, the hours, and the money finally meet.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-cream-200/80">
            Tasks across every department, time tracked against them, deliverables reviewed and
            approved, and a live read on every project's budget.
          </p>
        </div>
        <p className="text-sm text-cream-200/60">Kofa P/G · Phase 1 Digital Infrastructure</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <Logo height={32} tone="light" />
          </div>

          <h2 className="text-xl font-semibold text-ink-900">Sign in</h2>
          <p className="mt-1 text-sm text-ink-500">Invite-only. Use your Kofa work email.</p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <div>
              <label className="label">Work email</label>
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@kofapg.com"
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            {sent && (
              <p className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700">
                Magic link sent — check your inbox.
              </p>
            )}

            <button className="btn-primary w-full" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              Sign in
            </button>
            <button type="button" className="btn-accent w-full" onClick={magicLink} disabled={busy}>
              <Mail size={16} /> Email me a magic link
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-cream-300" />
            <span className="text-xs text-ink-400">or</span>
            <span className="h-px flex-1 bg-cream-300" />
          </div>

          <button type="button" className="btn-ghost w-full" onClick={google} disabled={busy}>
            <GoogleIcon /> Continue with Google
          </button>

          <div className="mt-8 rounded-xl border border-cream-300 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Demo logins
            </p>
            <div className="space-y-1">
              {DEMO_LOGINS.map((d) => (
                <button
                  key={d.email}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-cream-100"
                  onClick={() => {
                    setEmail(d.email)
                    setPassword(DEMO_PASSWORD)
                  }}
                >
                  <span>
                    <span className="block text-sm font-medium text-ink-800">{d.label}</span>
                    <span className="block text-xs text-ink-500">{d.note}</span>
                  </span>
                  <span className="text-xs text-brand-600">Use</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
