import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOnboardingPlan } from '@/lib/onboarding'

/**
 * The soft gate — which is to say, not a gate.
 *
 * The decision was that onboarding never blocks the app, so this is the entire
 * enforcement mechanism: a strip at the top of every screen naming what is
 * left, with a link back into the wizard. It is dismissible, but only for the
 * session (component state, not localStorage) -- a new hire who waves it away
 * on Monday should see it again on Tuesday, and a persisted dismissal would
 * quietly turn "remind me" into "never".
 *
 * It reads from useOnboardingPlan(), the same hook the wizard uses, so it
 * cannot claim something is outstanding that the wizard thinks is finished.
 */
export function SetupBanner() {
  const { profile } = useAuth()
  const plan = useOnboardingPlan()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || !plan.active || plan.loading || plan.complete) return null
  if (!profile) return null

  const outstanding = plan.steps.filter((s) => s.required && !s.done)
  if (outstanding.length === 0) return null

  // Name the work rather than showing a bare percentage: "Agreements and
  // Required reading" tells someone whether this is two minutes or twenty.
  const names = outstanding.map((s) => s.label)
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
          <Sparkles size={13} />
        </span>
        <p className="min-w-0 flex-1 text-sm text-amber-900">
          <span className="font-medium">Finish setting up your account</span>
          <span className="text-amber-800/80"> — {list} still to do ({plan.percent}% done).</span>
        </p>
        <Link
          to="/onboarding"
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Pick up where I left off <ArrowRight size={13} />
        </Link>
        <button
          className="rounded-lg p-1 text-amber-700/70 hover:bg-amber-100 hover:text-amber-900"
          title="Hide until next time I sign in"
          onClick={() => setDismissed(true)}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
