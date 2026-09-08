import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Emails a Kofa OS notification.
 *
 * Invoked by a database webhook on INSERT into public.notifications (see
 * supabase/migrations/*_enable_email_webhook.sql). Deliberately fail-soft: if
 * the key is unset, or Resend errors, it returns 200 and logs. The in-app
 * notification has already been written, so email is strictly additive and can
 * never break the app.
 *
 * verify_jwt is false because the caller is a Postgres webhook, not a user.
 * Authorisation is the shared secret in x-webhook-secret instead.
 */

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
const FROM = Deno.env.get('NOTIFICATION_FROM') ?? 'Kofa OS <noreply@kofapg.com>'
const REPLY_TO = Deno.env.get('NOTIFICATION_REPLY_TO') ?? undefined
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://kofaos.netlify.app').replace(/\/$/, '')
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')
const EMAIL_ENABLED = (Deno.env.get('EMAIL_ENABLED') ?? 'true') === 'true'

/**
 * Which notifications earn an email.
 *
 * The rule is "someone else is blocked until you act", not "something
 * happened" — every one of these has a person waiting at the other end. The
 * rest stay in the bell, which is what the bell is for.
 *
 * task_assigned is the pointed omission: it is the single most common
 * notification by an order of magnitude, and emailing all of them would train
 * everyone to filter Kofa OS to a folder they never open — taking the six
 * below with it.
 */
const EMAILABLE = new Set([
  'timesheet_submitted',        // a week is sitting in your approval queue
  'timesheet_decided',          // yours was cleared, or sent back for you to fix
  'deliverable_review',         // waiting on your review, or changes requested of you
  'time_extension_requested',   // someone needs a decision before they can continue
  'department_task_assigned',   // work reached your workstream with nobody on it
  'ticket_submitted',           // a request arrived for the admins
  'ticket_reply',               // someone answered, or asked you something
])

/** Mirrors src/lib/notificationLink.ts. Kept deliberately simple: no extra
 *  lookups, so a task links to the board rather than resolving its project.
 *  The in-app click-through does the precise version; this only has to land
 *  the reader on the right screen. */
function pathFor(record: Record<string, unknown>): string {
  const type = String(record.type ?? '')
  const entity = String(record.entity_type ?? '')
  const id = record.entity_id ? String(record.entity_id) : null

  if (entity === 'timesheet_week') {
    return type === 'timesheet_submitted'
      ? `/timesheet/approvals${id ? `?week=${id}` : ''}`
      : `/timesheet${id ? `?week=${id}` : ''}`
  }
  if (entity === 'ticket') {
    // The submitter's own list and the admin queue are different screens and
    // we cannot tell from here which the reader is. /tickets is right for
    // everyone except an admin reading a ticket someone else raised, who gets
    // one extra click.
    return `/tickets${id ? `?ticket=${id}` : ''}`
  }
  if (entity === 'project' && id) return `/projects/${id}?tab=budget`
  if (entity === 'deliverable') return '/deliverables'
  if (entity === 'task' || entity === 'subtask') return '/'
  return '/'
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Kofa P/G's palette, from tailwind.config.js. Inlined because email clients
 *  strip <style> blocks, and table layout because Outlook ignores flexbox. */
const BRAND = '#244A34'
const BRAND_TEXT = '#2E5C41'
const CREAM = '#FBF6EE'
const CARD_BORDER = '#E9DFCE'
const INK = '#1C1A16'
const INK_SOFT = '#545045'
const INK_FAINT = '#7C7669'

function render(opts: { firstName: string; title: string; body: string; url: string; cta: string }) {
  const { firstName, title, body, url, cta } = opts
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(body || title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

      <tr><td style="padding:0 4px 16px;">
        <span style="font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND};letter-spacing:.2px;">Kofa&nbsp;P/G</span>
        <span style="font:400 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK_FAINT};"> &nbsp;|&nbsp; OS</span>
      </td></tr>

      <tr><td style="background:#ffffff;border:1px solid ${CARD_BORDER};border-radius:16px;padding:28px;">
        <p style="margin:0 0 18px;font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">Hi ${escapeHtml(firstName)},</p>
        <h1 style="margin:0 0 10px;font:600 20px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">${escapeHtml(title)}</h1>
        ${body ? `<p style="margin:0 0 24px;font:400 15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">${escapeHtml(body)}</p>` : '<div style="height:6px;"></div>'}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background:${BRAND};border-radius:12px;">
            <a href="${url}" style="display:inline-block;padding:12px 22px;font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;">${escapeHtml(cta)}</a>
          </td>
        </tr></table>
        <p style="margin:22px 0 0;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK_FAINT};">Or paste this into your browser:<br>
          <a href="${url}" style="color:${BRAND_TEXT};text-decoration:underline;word-break:break-all;">${escapeHtml(url)}</a>
        </p>
      </td></tr>

      <tr><td style="padding:18px 4px 0;">
        <p style="margin:0;font:400 12px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK_FAINT};">
          You're getting this because something in Kofa OS is waiting on you. Everything else stays in the app — open the bell to see it.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`
}

/** Plain-text alternative. Not optional: an HTML-only message is a standing
 *  spam signal, and some clients still show this one. */
function renderText(o: { firstName: string; title: string; body: string; url: string }) {
  return [
    `Hi ${o.firstName},`,
    '',
    o.title,
    o.body ? `\n${o.body}` : '',
    '',
    o.url,
    '',
    "You're getting this because something in Kofa OS is waiting on you.",
  ].filter((l) => l !== '').join('\n')
}

function ok(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return ok({ error: 'POST only' }, 405)
  if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return ok({ error: 'unauthorized' }, 401)
  }

  let record: Record<string, unknown> | undefined
  try {
    const payload = await req.json()
    record = payload.record ?? payload
  } catch {
    return ok({ error: 'invalid JSON' }, 400)
  }
  if (!record?.user_id) return ok({ skipped: 'no user_id' })

  const type = String(record.type ?? '')
  if (!EMAILABLE.has(type)) return ok({ skipped: `type ${type} is in-app only` })

  if (!EMAIL_ENABLED || !RESEND_KEY) {
    console.log('Email disabled or RESEND_API_KEY unset; the in-app notification stands alone.')
    return ok({ skipped: 'email disabled' })
  }

  // Service role: we need the recipient's address, which RLS would otherwise
  // scope away from an anonymous caller.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // profiles is keyed by (user_id, org_id) and has NO `id` column. The
  // original wrote .eq('id', record.user_id), which errors in PostgREST, so
  // every send skipped with "no active recipient" and nothing was ever
  // delivered. Scope by org too: the same person can hold a membership in
  // more than one workspace, and the notification belongs to exactly one.
  let q = supabase.from('profiles').select('email, full_name, is_active').eq('user_id', record.user_id)
  if (record.org_id) q = q.eq('org_id', record.org_id)
  const { data: profile, error } = await q.maybeSingle()

  if (error) {
    console.error('Recipient lookup failed:', error.message)
    return ok({ sent: false, reason: 'lookup failed' })
  }
  if (!profile?.email || !profile.is_active) return ok({ skipped: 'no active recipient' })

  const title = String(record.title ?? 'Kofa OS update')
  const body = String(record.body ?? '')
  const firstName = String(profile.full_name ?? 'there').trim().split(/\s+/)[0] || 'there'
  const url = `${APP_URL}${pathFor(record)}`
  const cta = type === 'timesheet_submitted' ? 'Review the week'
    : type === 'deliverable_review' ? 'Open the deliverable'
    : type.startsWith('ticket') ? 'Open the ticket'
    : 'Open Kofa OS'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
        to: [profile.email],
        subject: title,
        html: render({ firstName, title, body, url, cta }),
        text: renderText({ firstName, title, body, url }),
        headers: { 'X-Entity-Ref-ID': String(record.id ?? '') },
      }),
    })
    if (!res.ok) {
      console.error('Resend rejected the send:', res.status, await res.text())
      return ok({ sent: false, status: res.status })
    }
    return ok({ sent: true })
  } catch (e) {
    console.error('Resend request failed:', e)
    return ok({ sent: false })
  }
})
