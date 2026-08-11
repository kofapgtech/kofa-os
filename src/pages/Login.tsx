import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Loader2, LogIn, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const DEMO_LOGINS = [
  { label: 'Leadership (admin)', email: 'amara@kofapg.com', note: 'Sees money, capacity, everything' },
  { label: 'Department lead', email: 'nia@kofapg.com', note: 'Studio — reviews deliverables' },
  { label: 'Staff', email: 'jules@kofapg.com', note: 'No rates, no margin' },
]
const DEMO_PASSWORD = 'KofaDemo2026!'

export function Login() {
  const { session, signInWithPassword, signInWithMagicLink } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

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

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-slate-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 font-bold">K</span>
          <span className="text-lg font-semibold tracking-tight">Kofa OS</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">
            Where the work, the hours, and the money finally meet.
          </h1>
          <p className="mt-4 max-w-md text-slate-300">
            Tasks across every department, time tracked against them, deliverables reviewed and
            approved, and a live read on every project's budget.
          </p>
        </div>
        <p className="text-sm text-slate-400">Kofa PG · Phase 1 Digital Infrastructure</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 font-bold text-white">
              K
            </span>
            <span className="text-lg font-semibold tracking-tight">Kofa OS</span>
          </div>

          <h2 className="text-xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Invite-only. Use your Kofa work email.</p>

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
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Magic link sent — check your inbox.
              </p>
            )}

            <button className="btn-primary w-full" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              Sign in
            </button>
            <button type="button" className="btn-ghost w-full" onClick={magicLink} disabled={busy}>
              <Mail size={16} /> Email me a magic link
            </button>
          </form>

          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Demo logins
            </p>
            <div className="space-y-1">
              {DEMO_LOGINS.map((d) => (
                <button
                  key={d.email}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                  onClick={() => {
                    setEmail(d.email)
                    setPassword(DEMO_PASSWORD)
                  }}
                >
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{d.label}</span>
                    <span className="block text-xs text-slate-500">{d.note}</span>
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
