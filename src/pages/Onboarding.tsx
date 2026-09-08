import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, PartyPopper } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCompleteOnboardingStep, useUpdateProfile } from '@/lib/queries'
import { useOnboardingPlan } from '@/lib/onboarding'
import { Logo } from '@/components/Logo'
import { Spinner } from '@/components/ui'
import {
  AccountStep,
  AgreementsStep,
  ReadingStep,
  WelcomeStep,
} from '@/components/onboarding/steps'

/**
 * The onboarding wizard.
 *
 * Full-screen and outside the AppShell on purpose: the sidebar is a menu of
 * places to go, and the one thing this screen asks is that you go through it.
 * It is still only a screen, though, not a gate -- "Finish later" is always
 * there, every step writes its progress the moment it completes, and nothing
 * here can stop anyone reaching the rest of the app. A person who closes the
 * tab halfway through comes back to exactly the step they left.
 *
 * What counts as "done" is not decided here; useOnboardingPlan() owns that, so
 * the wizard and the setup banner can never disagree about it.
 */
export function Onboarding() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const plan = useOnboardingPlan()
  const complete = useCompleteOnboardingStep()
  const update = useUpdateProfile()

  const [index, setIndex] = useState<number | null>(null)
  const [accountValid, setAccountValid] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [finished, setFinished] = useState(false)
  const accountSave = useRef<(() => Promise<void>) | null>(null)

  const steps = plan.steps

  // Open on the first unfinished step rather than always at the beginning —
  // the whole value of resumability is not re-reading the welcome message every
  // time. Set once, then left alone: recomputing it as steps complete would
  // yank the screen out from under someone mid-step.
  useEffect(() => {
    if (index !== null || plan.loading || steps.length === 0) return
    const first = steps.findIndex((s) => !s.done)
    setIndex(first === -1 ? 0 : first)
  }, [index, plan.loading, steps])

  // Stamp the start the first time anyone reaches this screen. Read by the
  // admin progress view in Phase 3 and by the reminder schedule.
  useEffect(() => {
    if (!profile || profile.onboarding_started_at) return
    void update
      .mutateAsync({ id: profile.user_id, patch: { onboarding_started_at: new Date().toISOString() } })
      .then(() => refreshProfile())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id, profile?.onboarding_started_at])

  // Stamp completion once every required step is done. Idempotent: the guard on
  // onboarding_completed_at means re-finishing a reopened step (a new version of
  // an agreement, say) doesn't rewrite the original date.
  useEffect(() => {
    if (!profile || !plan.active || plan.loading) return
    if (plan.complete && !profile.onboarding_completed_at) {
      void update
        .mutateAsync({
          id: profile.user_id,
          patch: { onboarding_completed_at: new Date().toISOString() },
        })
        .then(() => refreshProfile())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.complete, plan.active, plan.loading, profile?.user_id, profile?.onboarding_completed_at])

  const current = index === null ? null : steps[index] ?? null

  const canContinue = useMemo(() => {
    if (!current) return false
    if (current.key === 'account') return accountValid
    // Agreements and reading are completed by acting inside the step, so the
    // footer button only moves on once they actually are -- unless the step is
    // optional, in which case skipping is the point of marking it optional.
    if (current.key === 'agreements' || current.key === 'reading') {
      return current.done || !current.required
    }
    return true
  }, [current, accountValid])

  if (!profile) return null
  // Nothing configured for this person, or onboarding switched off entirely —
  // there is no screen to show, so don't show an empty one.
  if (!plan.loading && (!plan.active || steps.length === 0)) return <Navigate to="/" replace />
  if (plan.loading || index === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream-100">
        <Spinner label="Getting things ready" />
      </div>
    )
  }

  async function goNext() {
    if (!current) return
    setAdvancing(true)
    try {
      if (current.key === 'account' && accountSave.current) await accountSave.current()
      // welcome and account are marked done by passing through them; the other
      // two derive their state from signatures and read-ticks instead, so
      // writing a progress row for them would be a second, lying source.
      if (current.key === 'welcome' || current.key === 'account') {
        await complete.mutateAsync({ stepKey: current.key })
      }
    } finally {
      setAdvancing(false)
    }
    if (index! >= steps.length - 1) setFinished(true)
    else setIndex(index! + 1)
  }

  if (finished) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream-100 p-6">
        <div className="card max-w-md p-8 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600">
            <PartyPopper size={26} />
          </span>
          <h1 className="text-xl font-semibold text-ink-900">
            You're set up, {profile.preferred_name || profile.full_name.split(' ')[0]}.
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            {plan.complete
              ? 'Everything required is done. Your work is waiting on My Work, and Help & docs is in the sidebar whenever you need it.'
              : "You can pick up whatever's left from the banner at the top of any screen."}
          </p>
          <button className="btn-primary mt-6 w-full justify-center" onClick={() => navigate('/')}>
            Go to my work <ArrowRight size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="bg-brand-700">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
          <Logo height={28} />
          <button
            className="text-sm font-medium text-cream-200/80 hover:text-cream-50"
            onClick={() => navigate('/')}
          >
            Finish later
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Numbered rail rather than a bare bar: a new hire's first question is
            "how much more of this is there", and five labelled dots answer it
            better than a percentage does. */}
        <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {steps.map((s, i) => {
            const state = s.done ? 'done' : i === index ? 'current' : 'todo'
            return (
              <li key={s.key} className="flex items-center gap-2">
                <button
                  type="button"
                  // Any step already visited or completed can be revisited. A
                  // later one can't be jumped to: the order is the point.
                  disabled={i > index! && !s.done}
                  onClick={() => setIndex(i)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default ${
                    state === 'done'
                      ? 'bg-brand-600 text-white'
                      : state === 'current'
                        ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300'
                        : 'bg-cream-200 text-ink-400'
                  }`}
                >
                  {s.done ? <Check size={12} /> : <span>{i + 1}</span>}
                  {s.label}
                  {s.progress && !s.done ? (
                    <span className="opacity-70">
                      {s.progress.done}/{s.progress.total}
                    </span>
                  ) : null}
                </button>
                {i < steps.length - 1 && <span className="h-px w-3 bg-cream-300" />}
              </li>
            )
          })}
        </ol>

        <div className="card p-6">
          {current?.key === 'welcome' && <WelcomeStep plan={plan} />}
          {current?.key === 'account' && (
            <AccountStep onValidityChange={setAccountValid} saveRef={accountSave} />
          )}
          {current?.key === 'agreements' && <AgreementsStep plan={plan} />}
          {current?.key === 'reading' && <ReadingStep plan={plan} />}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            className="btn-ghost"
            disabled={index === 0}
            onClick={() => setIndex(Math.max(0, index! - 1))}
          >
            <ArrowLeft size={16} /> Back
          </button>

          <div className="flex items-center gap-2">
            {current && !current.required && !current.done && (
              <span className="text-xs text-ink-500">Optional</span>
            )}
            <button className="btn-primary" disabled={!canContinue || advancing} onClick={() => void goNext()}>
              {index! >= steps.length - 1 ? 'Finish' : 'Continue'} <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {current && !canContinue && (
          <p className="mt-2 text-right text-xs text-ink-500">
            {current.key === 'account'
              ? 'Add your name and set a password to continue.'
              : current.key === 'agreements'
                ? 'Sign the required documents to continue.'
                : 'Mark the required pages as read to continue.'}
          </p>
        )}
      </div>
    </div>
  )
}
