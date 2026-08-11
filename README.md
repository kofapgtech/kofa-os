# Kofa OS

Agency operations for Kofa PG: **Account → Project → Task**, time logged against tasks,
deliverables moved through a review workflow, and a live read on every project's budget.

Phase 1 covers the first four bullets of `Phase 1 Digital Infrastructure.md`:
task management, time tracking + notifications, deliverable workflow, and budget management.

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in from Supabase → Project Settings → API
npm run dev
```

Supabase project: **kofa-os** (`rhuwwmcmfmqgudcwzdyu`), Postgres 17, us-west-1.

## Demo logins

Password for all seeded accounts: `KofaDemo2026!`

| Email | Role | What they see |
|---|---|---|
| `amara@kofapg.com` | admin | Everything, including rates, margin, and the Command Centre |
| `nia@kofapg.com` | dept_lead | Studio's work; reviews deliverables; sees money |
| `jules@kofapg.com` | staff | All tasks and hours, **no** rates and **no** margin |

The client portal needs no login: **Accounts → Copy client link**, or open
`/portal/<token>` directly.

## How the security model actually works

Not "hidden in the UI" — enforced in Postgres:

- **Pay rates** live in `profile_rates`, which only `dept_lead`/`admin` can select.
  `profiles` has no rate columns at all.
- **Money per time entry** lives in `time_entry_costs`, same restriction. `time_entries`
  carries hours only.
- `v_project_budget` is declared `security_invoker = on`, so a staff member's query
  returns `accrued_amount: null` and `margin_pct: null` in the raw REST response —
  the numbers never reach the browser. Hours come back in full.
- **Deliverable stages** can only change through `transition_deliverable()`. A trigger
  rejects a raw `UPDATE` on `stage`, so the audit trail in `deliverable_reviews`
  cannot be bypassed. That table has no insert/update/delete policy at all.
- **Nobody approves their own work** — enforced in the RPC, not just greyed out.
- **The client portal** reaches the database through exactly two `SECURITY DEFINER`
  RPCs keyed on a revocable token. `anon` has no table privileges whatsoever
  (`revoke all on all tables in schema public from anon`). The portal returns a
  consumed *percentage* — never a dollar figure.

Remaining Supabase security advisors are expected: the five RLS helper functions must
be executable by signed-in users because policy expressions evaluate as the calling
role, and the four API RPCs are intentional. Everything else was revoked from `PUBLIC`.

## Deploying to Netlify

Build `npm run build`, publish `dist`. `netlify.toml` and `public/_redirects` already
carry the SPA rewrite so deep links like `/portal/:token` survive a refresh.

1. Set env vars in Netlify: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Add the deploy URL to Supabase → Authentication → URL Configuration → Redirect URLs,
   otherwise magic links bounce back to localhost.

## Email notifications (not yet live)

In-app notifications work now — realtime toasts via Supabase Realtime on `notifications`.

Email needs a Resend key. The `send-notification-email` Edge Function is deployed and
fail-soft: with no key it returns 200 and skips, so it can never break the app. To turn
it on, set the secrets and apply `supabase/migrations/13_enable_email_webhook.sql` —
instructions are in that file.

## Deliberately out of scope for Phase 1

CRM / client database · Deel & payroll · SOP module · Google Workspace integration ·
Gantt with dependencies · account-level retainer budgets · templates · deliverable
quality scoring.
