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

| Name | Email | Role | What they see |
|---|---|---|---|
| Jared Lewis | `jared@kofapg.com` | admin | Everything: rates, margin, Command Centre, full Admin page |
| Jordan Ellis | `jordan@kofapg.com` | executive | Everything admin sees **except** the ability to invite an employee |
| Priya Shah | `priya.hr@kofapg.com` | hr_manager | The roster (invite/edit staff & dept_lead only), plus every rate/budget number and the Payroll page — no operational writes |
| — dept_lead / staff — | see `profiles` table | dept_lead / staff | Their department's work; staff never see rates or margin |

## Roles

Five live roles today, plus one attribute that isn't a role at all:

| Role | Can do | Cannot do |
|---|---|---|
| `admin` | Everything | — |
| `executive` | Everything `admin` can, via `is_admin_or_executive()` (accounts, projects, rates, work streams, deleting things, issuing client links), including full workstream management (`can_manage_workstreams()`) | **Invite an employee** — the one capability deliberately withheld; enforced both in RLS and again in the `invite-employee` Edge Function's `ALLOWED_CALLER_ROLES`, not just hidden in the UI |
| `dept_lead` | Everything `staff` can, plus reviewing deliverables and seeing money (`is_lead_or_admin()`) | Reach the Admin page; invite; set rates |
| `hr_manager` ("HR") | Invite and edit **non-privileged** profiles only (`staff`/`dept_lead`) — enforced by a same-shape guard in both the `profiles_update` RLS policy and the invite Edge Function; read every rate/cost/budget figure (`has_financial_access()`), review pay periods and mark them paid; **and** manage workstreams (`can_manage_workstreams()`) — create, rename, delete, set leads, move members | Any other operational write — can't edit an account, a project, or someone else's time entry; touch an `admin`/`executive`/`hr_manager` profile, including their own |
| `staff` | Their own tasks, time, and deliverables they own | Rates, margin, anyone else's write access |

`employment_type` (`employee` \| `contractor`) on `profiles` is **not a role** — it's a
descriptive attribute with zero permission difference, set once at invite time.

**Work stream leads** aren't a role either — `workstream_members.is_lead` marks someone
as the coordination lead of one work stream. A lead can reassign tasks and decide
time-extension requests anywhere on that work stream's *project* (scoped to the whole
project today, since tasks don't yet carry a specific `workstream_id` in the UI — the
column exists, nothing sets it yet).

### Time-extension requests

Anyone can ask for more hours on a task (`task_time_requests`, no client `UPDATE` policy
at all — every decision goes through `decide_time_extension()`). The approver set is a
work stream lead of the task's project, a `dept_lead`, or `admin`/`executive` —
self-approval is blocked the same way deliverable self-approval is. Approving bumps
`tasks.estimated_hours` atomically; nothing enforces that a *direct* edit to that column
goes through the request flow — it's a recommended channel, not a locked one.

### Workstreams (`admin` / `executive` / `hr_manager`)

`can_manage_workstreams()` is the single gate: it backs the `departments`
insert/update/delete policies, the `department_leads` write/delete policies, and the
`delete_workstream()` RPC, and `canManageWorkstreams` in `AuthContext` mirrors it for the
nav link and the page guard. Deleting goes through the RPC rather than a raw delete —
`tasks`, `workstream_budgets`, `workstream_budget_requests`, `timesheet_weeks` and
`task_hour_allocations` all reference a workstream with a RESTRICT foreign key, so the RPC
refuses with a readable count of what's in the way, and clears `profiles.department_id`
(which has no FK) before deleting so nobody is left pointing at a workstream that's gone.

**HR's one gap:** moving someone's *primary* workstream writes `profiles.department_id`,
which still runs through the `profiles_update` escalation guard — so HR can move a
`staff`/`dept_lead` person but not an `admin`/`executive`. The additional-membership path
(`workstream_members`) has no such limit, so HR can still staff anyone onto any workstream.

### Payroll (`hr_manager` / `admin`)

`pay_periods` is a minimal review-and-mark-paid slice: `open → locked → paid`, the last
transition via `mark_pay_period_paid()`. It does **not** enforce that a locked/paid
period blocks `time_entries` edits — deliberately left open, matching
`docs/Kofa-OS-SOP.docx` §10.5's own unresolved question about who can override a
locked timesheet.

### Admin page

The **Admin** page is now three different views of the same page depending on who's
looking: `admin`/`executive` see everything (accounts, projects, work streams, roster);
`hr_manager` sees only Invite + Employees, with privileged rows locked read-only in the
table. From the full view, an admin or executive can:

- Create new accounts and projects.
- Invite new employees (`admin`/`hr_manager` only) — sends a real Supabase auth invite;
  the existing `on_auth_user_created` trigger (`handle_new_user()`) builds their profile
  from the invite metadata, via the `invite-employee` Edge Function.
- Reassign any employee's role or department (subject to the guards above).
- Create work streams on a project, add/remove employees, and mark one the lead
  (`workstreams` / `workstream_members` — a work stream belongs to one project; it's a
  different concept from department).

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

- **HR can't self-promote.** The `profiles_update` policy's `hr_manager` branch checks
  the role on *both* sides of the update (`USING` against the old row, `WITH CHECK`
  against the new one) — an HR account can edit a `staff`/`dept_lead` profile, but can
  neither touch nor create an `admin`/`executive`/`hr_manager` row,
  including its own. The same boundary is re-checked server-side in the
  `invite-employee` Edge Function, since that call runs on the service role and bypasses
  RLS entirely.
- **Executive can't invite.** `is_admin()` stayed narrowly defined as `role = 'admin'`
  specifically so it could keep gating the one thing `executive` doesn't get, while a new
  `is_admin_or_executive()` covers everywhere else admin-tier access applies.

Remaining Supabase security advisors are expected: the RLS helper functions must
be executable by signed-in users because policy expressions evaluate as the calling
role, and the API RPCs are intentional. Everything else was revoked from `PUBLIC`.

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

CRM / client database · a real Deel export/sync (payroll is review-and-mark-paid only,
see above) · SOP module · Google Workspace integration · Gantt with dependencies ·
account-level retainer budgets · templates · deliverable quality scoring · enforcing a
locked pay period against `time_entries` edits · scoping work-stream-lead authority to a
specific work stream rather than the whole project.
