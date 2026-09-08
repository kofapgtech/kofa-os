import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useIsPlatformAdmin } from '@/lib/queries'
import { EmptyState, PageHeader, TabButton } from '@/components/ui'
import { OnboardingSettingsTab } from '@/components/settings/OnboardingSettings'
import { WorkspaceSettings } from './WorkspaceSettings'

type TabKey = 'onboarding' | 'workspace'

/**
 * The Settings hub.
 *
 * Two audiences on one page, which is the only reason it is tabbed rather than
 * two nav entries: onboarding is administered by admin / executive / HR, and
 * workspace identity, money and the danger zone stay with the workspace owner.
 * A person who can only reach one tab never sees the strip at all, so the page
 * reads as "your settings" rather than advertising what they cannot open.
 *
 * The active tab lives in `?tab=` rather than component state so the workspace
 * switcher's "Workspace settings" item can still deep-link straight to it, and
 * so a link someone pastes to a colleague lands where they meant.
 */
export function Settings() {
  const { isAdmin, isExecutive, isHR, isOwner } = useAuth()
  const { data: isPlatformAdmin = false } = useIsPlatformAdmin()
  const [params, setParams] = useSearchParams()

  const canOnboarding = isAdmin || isExecutive || isHR
  const canWorkspace = isOwner || isPlatformAdmin

  const tabs = useMemo(() => {
    const out: { key: TabKey; label: string }[] = []
    if (canOnboarding) out.push({ key: 'onboarding', label: 'Onboarding' })
    if (canWorkspace) out.push({ key: 'workspace', label: 'Workspace' })
    return out
  }, [canOnboarding, canWorkspace])

  // Falls back to the first tab they CAN see rather than a fixed default, so
  // ?tab=workspace from a non-owner shows onboarding instead of an empty page.
  const requested = params.get('tab') as TabKey | null
  const active = tabs.some((t) => t.key === requested) ? requested! : tabs[0]?.key

  if (!active) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Settings" />
        <EmptyState
          title="Nothing here for your role."
          hint="Onboarding is configured by admins, executives and HR; workspace settings by the workspace owner."
        />
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle={
          active === 'onboarding'
            ? 'What a new employee or contractor is asked to do before they start'
            : 'Identity, money and ownership for this workspace'
        }
      />

      {tabs.length > 1 && (
        <div className="mb-5 flex border-b border-cream-200">
          {tabs.map((t) => (
            <TabButton
              key={t.key}
              active={active === t.key}
              onClick={() => setParams({ tab: t.key }, { replace: true })}
            >
              {t.label}
            </TabButton>
          ))}
        </div>
      )}

      {active === 'onboarding' ? <OnboardingSettingsTab /> : <WorkspaceSettings embedded />}
    </div>
  )
}
