import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, CheckCircle2, Clock, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { PortalPayload } from '@/lib/types'
import { PROJECT_STATUS_CLASS, PROJECT_STATUS_LABEL, hours, longDate, shortDate } from '@/lib/format'
import { BurnBar, Spinner } from '@/components/ui'
import { Logo } from '@/components/Logo'

/**
 * Anonymous client view. Everything it can see comes from one SECURITY
 * DEFINER RPC keyed on the share token — no session, no table access, and
 * no dollar figures, only a consumed percentage.
 */
export function Portal() {
  const { token } = useParams()
  const [data, setData] = useState<PortalPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [rejecting, setRejecting] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_account_portal', { p_token: token })
    if (error) {
      setError(error.message)
      return
    }
    setData(data as PortalPayload)
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function decide(deliverableId: string, decision: 'approve' | 'request_changes') {
    if (decision === 'request_changes' && !comment.trim()) {
      setRejecting(deliverableId)
      return
    }
    setBusy(deliverableId)
    const { error } = await supabase.rpc('portal_review_deliverable', {
      p_token: token,
      p_deliverable_id: deliverableId,
      p_decision: decision,
      p_comment: comment || null,
    })
    setBusy(null)
    if (error) {
      setError(error.message)
      return
    }
    setComment('')
    setRejecting(null)
    await load()
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="card max-w-md p-8 text-center">
          <p className="text-base font-semibold text-ink-900">This link isn't valid</p>
          <p className="mt-2 text-sm text-ink-600">
            It may have expired or been revoked. Ask your Kofa contact for a fresh one.
          </p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Loading your dashboard…" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="bg-brand-700">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3.5">
            <Logo height={30} showProduct={false} />
            <span className="h-6 w-px bg-cream-200/25" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-cream-50">{data.account.name}</p>
              <p className="text-xs text-cream-200/70">Client dashboard</p>
            </div>
          </div>
          <span className="hidden text-xs text-cream-200/60 sm:block">Read-only view</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 py-6">
        {data.awaiting_approval.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
              Waiting for your approval
            </h2>
            <div className="space-y-3">
              {data.awaiting_approval.map((d) => (
                <div key={d.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{d.title}</p>
                      <p className="text-xs text-ink-500">
                        {d.project_name} · v{d.version} · due {shortDate(d.due_date)}
                      </p>
                      {d.description && <p className="mt-2 text-sm text-ink-600">{d.description}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn-primary"
                        disabled={busy === d.id}
                        onClick={() => void decide(d.id, 'approve')}
                      >
                        <Check size={15} /> Approve
                      </button>
                      <button
                        className="btn-danger"
                        disabled={busy === d.id}
                        onClick={() => void decide(d.id, 'request_changes')}
                      >
                        <RotateCcw size={15} /> Request changes
                      </button>
                    </div>
                  </div>

                  {rejecting === d.id && (
                    <div className="mt-3">
                      <textarea
                        className="input min-h-[80px]"
                        placeholder="What would you like changed?"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        autoFocus
                      />
                      <button
                        className="btn-danger mt-2"
                        disabled={!comment.trim() || busy === d.id}
                        onClick={() => void decide(d.id, 'request_changes')}
                      >
                        Send feedback
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Your projects
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.projects.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-900">{p.name}</p>
                  <span className={`chip shrink-0 ${PROJECT_STATUS_CLASS[p.status]}`}>
                    {PROJECT_STATUS_LABEL[p.status]}
                  </span>
                </div>
                <div className="mt-3">
                  <BurnBar percent={p.consumed_pct} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
                  <span className="flex items-center gap-1.5">
                    <Clock size={13} /> {hours(p.hours_logged)} of {p.budget_hours}h
                  </span>
                  <span>
                    {p.open_tasks} open · due {shortDate(p.due_date)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {data.recently_approved.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
              Recently approved
            </h2>
            <div className="card divide-y divide-cream-200">
              {data.recently_approved.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <CheckCircle2 size={16} className="shrink-0 text-brand-600" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">{d.title}</span>
                      <span className="block text-xs text-ink-500">{d.project_name}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-400">{longDate(d.approved_at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
