/** What a given person still has to do, computed once and shared.
 *
 *  Both the wizard (src/pages/Onboarding.tsx) and the setup banner read from
 *  here, which is the point: "are they finished?" is answered in exactly one
 *  place. Two implementations would disagree the first time a step's rules
 *  changed, and the symptom — a banner that never clears, or clears early —
 *  is the kind of thing a new hire reports rather than notices.
 *
 *  The source of truth differs by step on purpose:
 *
 *    welcome / account      a row in onboarding_progress, written by the step
 *    agreements             a SIGNATURE at the agreement's CURRENT version
 *    reading                a progress row per article
 *
 *  Deriving agreements from signatures rather than a progress row is what
 *  makes a version bump reopen the step by itself: nothing has to go back and
 *  invalidate anything, because the answer was never cached.
 */
import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useOnboardingAgreements,
  useOnboardingProgress,
  useOnboardingReading,
  useOnboardingSettings,
  useOnboardingSignatures,
} from '@/lib/queries'
import { DOCS_BY_SLUG } from '@/docs'
import type { Doc } from '@/docs'
import type { OnboardingAgreement, OnboardingReadingItem } from '@/lib/types'

/** Step keys the wizard has a screen for. A key in onboarding_settings.steps
 *  that isn't here is ignored rather than rendered blank, so an admin can add
 *  a row for a step that doesn't exist yet without breaking anyone's flow. */
export const KNOWN_STEP_KEYS = ['welcome', 'account', 'agreements', 'reading'] as const
export type KnownStepKey = (typeof KNOWN_STEP_KEYS)[number]

export interface PlanStep {
  key: KnownStepKey
  label: string
  required: boolean
  done: boolean
  /** "2 of 5" for steps made of sub-items; null for the all-or-nothing ones. */
  progress: { done: number; total: number } | null
}

export interface PlanReadingItem {
  item: OnboardingReadingItem
  doc: Doc
  read: boolean
}

export interface OnboardingPlan {
  /** False when the workspace has onboarding switched off, or there is no
   *  settings row, or there is no profile yet. Nothing should render. */
  active: boolean
  loading: boolean
  steps: PlanStep[]
  agreements: OnboardingAgreement[]
  signedAgreementIds: Set<string>
  reading: PlanReadingItem[]
  /** Every REQUIRED step done. Optional steps never hold this back. */
  complete: boolean
  /** Counts required steps only, so the bar can't sit at 80% forever because
   *  of a step nobody has to do. */
  percent: number
  welcomeTitle: string
  welcomeBody: string
  welcomeVideoUrl: string | null
}

const EMPTY: OnboardingPlan = {
  active: false,
  loading: false,
  steps: [],
  agreements: [],
  signedAgreementIds: new Set(),
  reading: [],
  complete: true,
  percent: 100,
  welcomeTitle: '',
  welcomeBody: '',
  welcomeVideoUrl: null,
}

export function useOnboardingPlan(): OnboardingPlan {
  const { profile } = useAuth()
  const settingsQ = useOnboardingSettings()
  const agreementsQ = useOnboardingAgreements()
  const readingQ = useOnboardingReading()
  const progressQ = useOnboardingProgress()
  const signaturesQ = useOnboardingSignatures()

  const loading =
    settingsQ.isLoading ||
    agreementsQ.isLoading ||
    readingQ.isLoading ||
    progressQ.isLoading ||
    signaturesQ.isLoading

  const settings = settingsQ.data ?? null
  const allAgreements = agreementsQ.data ?? []
  const allReading = readingQ.data ?? []
  const progress = progressQ.data ?? []
  const signatures = signaturesQ.data ?? []

  return useMemo(() => {
    if (loading) return { ...EMPTY, loading: true }
    if (!profile || !settings || !settings.enabled) return EMPTY

    const track = profile.employment_type
    const doneKeys = new Set(progress.map((p) => p.step_key))

    // Only active agreements for this person's track, in configured order.
    const agreements = allAgreements
      .filter((a) => a.is_active && a.applies_to.includes(track))
      .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))

    // A signature counts only at the agreement's CURRENT version.
    const signedAgreementIds = new Set(
      signatures
        .filter((s) =>
          agreements.some((a) => a.id === s.agreement_id && a.version === s.agreement_version),
        )
        .map((s) => s.agreement_id),
    )

    // A slug whose article has been renamed or removed from the repo is
    // skipped rather than blocking the step on something nobody can open.
    const reading: PlanReadingItem[] = allReading
      .filter((r) => r.applies_to.includes(track))
      .sort((a, b) => a.sort_order - b.sort_order)
      .flatMap((item) => {
        const doc = DOCS_BY_SLUG[item.doc_slug]
        if (!doc) return []
        return [{ item, doc, read: doneKeys.has(`reading:${item.doc_slug}`) }]
      })

    const requiredAgreements = agreements.filter((a) => a.is_required)
    const requiredReading = reading.filter((r) => r.item.is_required)

    const steps: PlanStep[] = (settings.steps ?? [])
      .filter(
        (s): s is typeof s & { key: KnownStepKey } =>
          s.enabled &&
          s.applies_to.includes(track) &&
          (KNOWN_STEP_KEYS as readonly string[]).includes(s.key),
      )
      .map((s) => {
        // The counter tracks the REQUIRED items, the same set that decides
        // `done`. Counting optional ones too would show "4/10" on a step that
        // completes at 7, so the chip would still read as unfinished at the
        // moment the step goes green — and the optional extras are visible in
        // the list itself either way. Where nothing is required, the counter
        // falls back to the full list so an all-optional step still shows
        // movement rather than a bare label.
        if (s.key === 'agreements') {
          const signedOf = (list: typeof agreements) =>
            list.filter((a) => signedAgreementIds.has(a.id)).length
          const counted = requiredAgreements.length ? requiredAgreements : agreements
          return {
            key: s.key,
            label: s.label,
            required: s.required,
            // A step with nothing required is vacuously done — an admin who has
            // not uploaded an NDA yet must not strand every new hire.
            done: signedOf(requiredAgreements) === requiredAgreements.length,
            progress: counted.length ? { done: signedOf(counted), total: counted.length } : null,
          }
        }
        if (s.key === 'reading') {
          const readOf = (list: PlanReadingItem[]) => list.filter((r) => r.read).length
          const counted = requiredReading.length ? requiredReading : reading
          return {
            key: s.key,
            label: s.label,
            required: s.required,
            done: readOf(requiredReading) === requiredReading.length,
            progress: counted.length ? { done: readOf(counted), total: counted.length } : null,
          }
        }
        return {
          key: s.key,
          label: s.label,
          required: s.required,
          done: doneKeys.has(s.key),
          progress: null,
        }
      })

    const required = steps.filter((s) => s.required)
    const requiredDone = required.filter((s) => s.done).length

    return {
      active: true,
      loading: false,
      steps,
      agreements,
      signedAgreementIds,
      reading,
      complete: required.every((s) => s.done),
      percent: required.length === 0 ? 100 : Math.round((requiredDone / required.length) * 100),
      welcomeTitle: settings.welcome_title,
      welcomeBody: settings.welcome_body,
      welcomeVideoUrl: settings.welcome_video_url,
    }
  }, [loading, profile, settings, allAgreements, allReading, progress, signatures])
}
