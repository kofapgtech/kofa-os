# PRD — Workspaces

**Status:** Phases 1, 2 and 3 SHIPPED 2026-08-31 · commercial layer deferred
**Author:** Kofa Tech
**Epic:** Workspaces
**Prototype:** eight clickable screens — see the Workspaces prototype artifact

---

## 1. Summary

Kofa OS is a single-tenant product with a multi-tenant database. All 26 tables have
RLS on, 24 carry an `org_id`, and 68 of the 72 policies already begin
`org_id = current_org_id()`. Storage is org-path-scoped, views are
`security_invoker`, and the invite Edge Function takes the org from the caller's
own profile. What is missing is the control plane around that data model — creating
a workspace, joining one, switching between them, and charging for it.

**Scope decision (2026-08-30): the commercial layer is deferred. We build the
internal workspace first.**

That is not a consolation prize. Every workspace — ours today, a customer's later —
needs somewhere to put its *own* work: the website rebuild, the ops tooling, next
year's media planning. Today Kofa OS has no such place, so that work is filed under
a client-shaped account called "Kofa P/G" and every internal project is forced to
invent a budget and a length it does not have. `Kofa OS` currently claims a
$67,300 budget over 12 months. None of that is real.

So the phasing is:

| Phase | What | Why now / why not |
|---|---|---|
| **1 — The internal workspace** | A default internal account per workspace; projects on it can run with no budget and no end date | Shippable against today's single-org schema. No tenancy migration needed. It is also exactly what `create_workspace()` will seed later, so it is not throwaway |
| **2 — Tenancy foundation** | Split identity from membership; active workspace; isolation hardening | The structural change. No user-visible effect. Needed before any second workspace exists |
| **3 — Workspace lifecycle** | Create, invite, switch, settings, branding | The first release an outside agency could use |
| **Later — Commercial & vendor ops** | Plans, seats, Stripe, support console | Deferred. A pilot can be invoiced by hand |

Phases 2–4 are sketched in §5–§7. Phase 1 is specified in full.

### Naming

The user-facing noun is **Workspace**. The schema keeps `org_id` / `organizations` —
renaming a column that appears on 24 tables, 29 foreign keys and 72 policy
expressions buys nothing. *Workspace in the UI, `org` in the database.*

---

## 2. Problem

**The immediate one.** There is nowhere to put internal work. Three projects —
`Kofa OS`, `Kofa Website`, `FY26 Media Planning` — sit under an account that
looks like a client, each carrying a fabricated budget and month count, and
between them 17 monthly-budget rows, 4 of them *approved*, that describe money
nobody is spending. Every burn bar, margin figure and budget alert on those
projects is noise. Worse, it pollutes the real numbers: the Command Centre's
"total budget" and every account rollup silently include them.

**The one behind it.** Kofa OS is good enough that other agencies would pay for
it, and we cannot onboard one without a developer running SQL by hand. Isolation
also has to be a property of the database rather than of our carefulness — the
audit found the RLS layer in far better shape than expected, but it also found
four real holes (§5.3). Those close before anyone outside Kofa PG has a login.

### Explicitly not the problem

Internal noise — "I see too much of other teams' work" — is a filtering problem.
Workspaces are a hard tenant boundary, not a view preference. Kofa PG stays one
workspace.

---

## 3. Phase 1 — The internal workspace

### 3.1 The shape

Every workspace gets exactly one **internal account**: a protected `accounts` row
that holds the workspace's own work rather than a client's. Projects on it — and
**only** on it — may run with no budget and no end date.

Two scoping calls made on 2026-08-30, both deliberate:

- **Untracked is internal-only.** A client project always requires a budget and a
  length. Open-ended client retainers have the same underlying problem, but
  loosening the rule for clients removes a guardrail that currently works, and
  nothing is asking for it yet. Revisit when a retainer actually needs it.
- **Untracked projects show hours and internal cost, not money-versus-budget.**
  Budget bar, margin, burn %, projected spend and threshold alerts all disappear.
  What replaces them is hours logged, hours allocated, and — for anyone with
  `has_financial_access()` — what that time cost the company. Knowing the website
  rebuild has eaten £18k of staff time is the number that matters internally.

### 3.2 Data model

```sql
alter table accounts add column is_internal boolean not null default false;

-- at most one internal account per workspace
create unique index accounts_one_internal_per_org
  on accounts (org_id) where is_internal;

alter table projects alter column budget_amount  drop not null;
alter table projects alter column length_months  drop not null;
```

The semantics turn on NULL, not on a flag:

| Column | `NULL` means | `0` still means |
|---|---|---|
| `projects.budget_amount` | No budget is tracked | A tracked budget that happens to be zero |
| `projects.length_months` | Open-ended | *(invalid — nothing sets it)* |

Using NULL rather than a separate `budget_tracked boolean` keeps one source of
truth, and it is what the existing views and functions already degrade against
(§3.4).

### 3.3 Guard rails

**Untracked only on the internal account.** A `CHECK` cannot reach across to
`accounts`, so this is a trigger on `projects`, firing on INSERT and UPDATE —
the UPDATE case matters, because it is what stops someone moving an untracked
project onto a client account:

```sql
create or replace function projects_untracked_requires_internal()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if (new.budget_amount is null or new.length_months is null)
     and not exists (
       select 1 from public.accounts a
       where a.id = new.account_id and a.is_internal
     )
  then
    raise exception
      'Only projects on the internal account can run without a budget or an end date';
  end if;
  return new;
end $$;
```

> **Alternative worth preferring if Phase 2 lands first.** Phase 2 adds composite
> `(id, org_id)` foreign keys to stop cross-workspace references (§5.3a). If we
> are rewriting those FKs anyway, denormalise `is_internal` onto `projects` via
> `accounts unique (id, is_internal)` + `projects (account_id, is_internal) references
> accounts (id, is_internal)`. The flag then cannot go stale, and the rule becomes a
> plain `CHECK (is_internal or (budget_amount is not null and length_months is not null))`
> — declarative rather than procedural.

**The internal account is protected.**

- `accounts_delete` policy gains `and not is_internal`. It cannot be deleted.
- A trigger rejects any UPDATE that changes `is_internal`. It cannot be demoted,
  and no second account can be promoted (the partial unique index).
- `create_account_share_link()` raises on an internal account. The client portal
  is for clients; there is no client here to share with.

### 3.4 What already works — no change needed

`v_project_budget` is already NULL-safe, which is a genuinely lucky result and
was verified expression by expression:

| Field | Behaviour with `budget_amount IS NULL` |
|---|---|
| `pct_amount` | `CASE WHEN … AND p.budget_amount > 0` — `NULL > 0` is NULL, so the branch fails and it returns NULL |
| `remaining_amount` | `round(NULL - accrued)` → NULL |
| `target_end_date` | `start_date + NULL months` → NULL |
| `projected_amount` | Guarded on `length_months > 0` → NULL |
| `margin_pct` | Guarded on `accrued_amount > 0`; with non-billable internal time that is 0 → NULL |
| `accrued_cost` | **Unaffected** — already in the view, already gated by `time_entry_costs` RLS + `security_invoker`. This is the number the new UI shows |

So the views need no migration at all. `v_user_utilization` likewise: it already
reports total `hours` and `billable_hours` separately, so internal work correctly
keeps someone busy without counting as billable.

### 3.5 What breaks, and must be fixed

Six things. The first is the one that would have bitten in production.

**(1) Assignment is impossible on an untracked project.** Since the hour-allocation
change, a person is assigned to a task *by* being given hours. `TaskViews.tsx`
`tryAdd()` does:

```js
const remaining = wb?.remaining_amount ?? 0
if (cost !== null && cost > remaining + 0.005) { /* divert to a budget request */ }
```

On an untracked project there is no `workstream_budgets` row, so `wb` is
`undefined`, `remaining` falls back to `0`, and **every allocation for anyone with
a rate is diverted into a budget-request flow that has no budget to request
against**. Nobody can be assigned to internal work at all.

Fix: when the project is untracked, skip the check and commit directly. The
allocation strip shows `N hours committed · <cost> internal cost` in place of the
allocated/committed/remaining line.

**(2) Budget rollups quietly absorb untracked projects.** `CommandCenter.tsx:61`
and `Accounts.tsx:73` both do `reduce((s, p) => s + p.budget_amount, 0)`. NULL
adds as 0, so nothing crashes — it just means "total budget across 13 active
projects" now averages in projects that have no budget. Fix: filter to tracked
projects and say so in the label — *"£1.2M across 10 tracked projects · 3 internal"*.

**(3) Project detail's budget panel is meaningless.** Four stat tiles (consumed,
remaining, projected, burn bar) plus the Monthly Budget Planner tab. On an
untracked project, replace with **hours logged**, **hours allocated**, and
**accrued internal cost** (financial access only); hide the planner tab entirely.

**(4) The New/Edit Project form requires both fields.** Add *Track a budget* and
*Set a length* toggles, shown only when the selected account is internal, and
defaulted **off** there. Switching the account picker to a client account
re-enables and re-requires both — matching the trigger, so the form never lets
you submit something the database will reject.

**(5) `default_billable` should be `false` on internal projects.** New time then
records `billable_amount = 0`, which keeps `accrued_amount` at 0 and `margin_pct`
at NULL without any special-casing. Cost still records normally, so payroll is
unaffected.

**(6) `check_project_budget()` is correct only by accident.** Its guard is
`if v_project.budget_amount <= 0 then return; end if`. With NULL that condition is
NULL, so the early return does *not* fire and it proceeds to divide by NULL —
`v_pct` becomes NULL, `NULL >= 75` is never true, and no alert is raised. Right
answer, wrong reasoning, and one refactor away from breaking. Make it explicit:

```sql
if v_project.budget_amount is null or v_project.budget_amount <= 0 then return; end if;
```

### 3.6 Migrating Kofa's own data

Adopt the existing account rather than creating a second one:

1. `update accounts set is_internal = true where name = 'Kofa P/G'`.
2. On `Kofa OS`, `Kofa Website` and `FY26 Media Planning`: set `budget_amount = null`,
   `length_months = null`, `default_billable = false`.
3. Delete their **17 `project_monthly_budgets` rows** — 12 on Kofa OS (4 of them
   `approved`), 2 on Kofa Website, 3 on FY26 Media Planning — and the **3
   `workstream_budgets` rows** on Kofa OS. The migration deletes directly and so
   bypasses the past-month and approved-month guards in
   `set_project_monthly_budgets()`. That is intended and one-off.
4. Tasks, time entries and the one existing hour allocation are untouched.

**Open decision — historical billable flags.** Those three projects have 172 time
entries, 154 of them marked billable, which have been accruing
`billable_amount` against the fabricated budgets. Left alone, `accrued_amount` stays
non-zero on an untracked project and `margin_pct` will compute a margin that means
nothing.

- *Recommended:* flip them to `is_billable = false` in the migration. The
  `time_entry_after_write` trigger re-derives `billable_amount` to 0, and margin
  falls to NULL naturally. Nothing was ever billed to a client from these
  projects, and payroll is unaffected because it uses `cost_rate`. This is a
  correction, not a loss.
- *Alternative:* leave history intact and suppress margin in the UI for untracked
  projects. Cheaper migration, one more special case in the code, and the stored
  numbers stay wrong.

Flagged rather than assumed, because it rewrites 154 rows of history.

### 3.7 UX

- **Accounts page.** The internal account is pinned to the top with an *Internal*
  badge, no client-link button, and no delete. Its rollup shows hours and cost, not
  budget.
- **New project.** Choosing the internal account reveals the two toggles, off by
  default, with the fields collapsed behind them.
- **Project tile & detail header.** An *Internal · open-ended* chip where the burn
  bar would be.
- **Command Centre.** Untracked projects appear in the project list with an em-dash
  in the budget column, and are excluded from the budget totals with a visible count.
- **My Work / Board / Calendar.** No change. Internal tasks behave like any other.

### 3.8 Acceptance criteria

1. A project on the internal account can be created with no budget and no length,
   and saves.
2. The same attempt on a client account is rejected — by the database, not only the
   form.
3. Someone can be assigned to a task on an untracked internal project via hour
   allocation, with no budget request.
4. Project detail on an untracked project shows hours and internal cost, and no
   budget bar, margin, projected spend or planner tab.
5. Staff (no financial access) see hours and no cost figure anywhere on it.
6. Command Centre budget totals exclude untracked projects and say how many were
   excluded.
7. No budget-threshold notification is ever raised for an untracked project.
8. The internal account cannot be deleted, demoted, or issued a client link.
9. The three migrated Kofa projects show no budget artefacts, and their tasks,
   time entries and hour allocation are intact.

---

## 4. Phase 2 — Tenancy foundation  ✅ SHIPPED 2026-08-31

> **As built.** Seven migrations, `20260831010812` → `20260831032043`. Two
> deviations from the sketch below, both deliberate:
>
> 1. **The surrogate key is `membership_id`, not `id`, and there is no
>    `profiles.id` at all.** Function bodies are stored as text and are not
>    rewritten by a column rename, so a stray `where id = auth.uid()` would have
>    matched nothing against a surrogate `id` and silently denied access to
>    everyone. With no such column it raises instead. Fail loud, not quiet.
> 2. **Display fields stayed on `profiles`** (per-membership) rather than moving
>    to `app_users`. Smaller blast radius, and a per-workspace display name is
>    defensible. `app_users` is a pure identity anchor.
>
> Also found and fixed, which this section did not anticipate: `profile_rates`
> was `PRIMARY KEY (profile_id)` — one pay rate per person for the whole
> installation. Widened to `(profile_id, org_id)`.
>
> The gate is `check_workspace_isolation()`: eight checks, all passing.


No user-visible change. This is the structural work, and it ships alone so a
rollback is never ambiguous.

### 4.1 Identity vs membership

`profiles` currently does two jobs: it is the global identity (`profiles.id` **is**
`auth.users.id`) *and* the membership record (`org_id`, `role`, `department_id`,
rates, capacity, employment type). Because one row does both, a person can only
ever have one workspace — and since `auth.users.email` is unique across the whole
project, **one email address can never exist in two workspaces**. Two customer
agencies sharing a freelancer is not an edge case in this industry.

```
app_users   id → auth.users.id · full_name · email · avatar_url
profiles    id (new surrogate) · user_id → app_users · org_id · role
            · department_id · title · capacity · employment_type · is_active …
            unique (user_id, org_id)
```

**Why the migration is cheaper than it looks.** 29 FK constraints across 21 tables
point at `profiles(id)`. They do not need repointing at the new membership key,
because every one of those child rows already carries its own `org_id` — so
`(actor_column, row.org_id)` already identifies the membership. The FKs only need
to mean "a person", so they repoint at `app_users(id)`. And because `profiles.id`
values already *are* `auth.users.id` values, that repoint is metadata-only: drop
constraint, add constraint, no row rewritten.

### 4.2 Active workspace

An `active_workspace (user_id, org_id)` table, read by a rewritten
`current_org_id()` that falls back to the user's single membership. Switching is
one RPC that **must** verify an active membership before writing — that check is
the entire security boundary of the switcher. Every other helper gains
`and org_id = current_org_id()`.

Known limit: per-user, not per-tab, so two tabs in different workspaces fight. The
fix is a JWT claim via a custom access token hook; worth doing once the switcher is
in real use, not worth blocking on.

### 4.3 Isolation hardening

Four gaps, all found in the audit, all fixable:

**(a) Cross-workspace foreign keys are not prevented.** Policies check
`org_id = current_org_id()` on the row being written, but nothing checks the
*parent* is in the same org — a crafted insert could attach an org-A task to an
org-B project. Fix with composite `(id, org_id)` foreign keys on every
parent/child pair.

**(b) `notifications` RLS keys on `user_id` alone.** Correct while one user means
one org; wrong the moment memberships are many-to-one. Add
`and org_id = current_org_id()` to all three policies and to the realtime filter in
`NotificationsContext`, which is also `user_id`-only.

**(c) The `avatars` bucket is public and keyed only on `auth.uid()`.** Low severity
— they are profile photos — but a customer's security review will ask. Recommend
keeping it public, adding the org prefix, and stating the choice rather than
pretending otherwise.

**(d) Portal share links outlive their workspace.** `get_account_portal()` and
`portal_review_deliverable()` check the token but not the workspace's status.

**And the gate:** an isolation regression suite — for every table, sign in as a
workspace-A user, assert zero workspace-B rows and that every cross-org write is
rejected. It runs in CI and blocks deploy. "No workspace can read another's data"
is not a claim we make, it is a test that passes.

---

## 5. Phase 3 — Workspace lifecycle  ✅ SHIPPED 2026-08-31

> **As built.** Three migrations, `20260831040913` → `20260831041015`, plus the
> switcher and a `/settings` page. Three scoping calls made on the day:
>
> 1. **`create_workspace()` is gated to platform staff, not self-serve.** The
>    machinery is built and exercised; production's front door stays shut while
>    Kofa's payroll data lives here. Opening it later is a one-line change.
> 2. **`owner` is a flag on the membership, not a role.** Nothing that switches
>    on `role` had to change. Owner powers are checked with
>    `is_workspace_owner()`, never by reading `role`.
> 3. **Currency and pay cadence are wired through**, not just stored.
>
> A real second workspace — **Meridian Studio**, GBP, biweekly — now exists, and
> the isolation claim is no longer structural: a dual-membership user sees zero
> rows from the workspace they are not in, and a cross-workspace write is
> rejected by the composite foreign key. Teardown script:
> `supabase/migrations/_TEARDOWN_meridian_test_workspace.sql`.
>
> Still open from this section: `workspace_invites` (pending invites are not yet
> visible or revocable), the onboarding checklist and empty states, and rendering
> the stored logo/brand colour in `Logo.tsx`.


- **`create_workspace(name, slug)`** — one `SECURITY DEFINER` RPC, one transaction:
  insert the organisation, make the caller its owner, set it active, seed the six
  default workstreams, seed pay periods, **and create the internal account from
  Phase 1**. That last step is why Phase 1 is not throwaway work.
- **Signup** — replace `restrict_new_auth_users_to_org_domain()` (hardcoded
  `kofapg.com`) with: a valid invite, an allow-listed domain on the target
  workspace, or creating a new workspace. Kofa PG's row holds `{kofapg.com}`, so our
  own behaviour is unchanged. The hardcoded `hd: 'kofapg.com'` in
  `AuthContext.signInWithGoogle` moves to that setting.
- **Invites** — extend the existing Edge Function. The important new branch: if the
  invited email already has an `app_users` row, add a membership rather than
  creating an auth user. Highest-risk path in the epic; it gets its own tests.
- **Settings & branding** — logo, brand colour, timezone, week start, allowed
  domains, plus two that are load-bearing:
  - `ensure_pay_periods()` **hardcodes semi-monthly** (1st–15th, 16th–EOM). Other
    agencies pay biweekly or monthly.
  - `src/lib/format.ts` **hardcodes USD** via `Intl.NumberFormat('en-US', …)` for
    every rate, budget and payroll figure in the app.
- **Onboarding** — a setup checklist and real empty states. A new workspace lands in
  an app built for populated data.

---

## 6. Later — commercial & vendor operations

Deferred by the 2026-08-30 scoping call; recorded so the shape is not lost.

- Plans, seats counted as active memberships, trial, Stripe.
- `past_due` / `canceled` → **read-only, enforced in RLS**, never deletion.
- Platform console gated on a `platform_admins` table (not a role), with support
  access as a time-boxed, reasoned, audited grant rather than a service-role bypass.
- Per-workspace export and hard delete.

---

## 7. Success metrics

| Metric | Target |
|---|---|
| Internal projects carrying a fabricated budget | 3 → **0** |
| Assignment on an internal task without a budget request | Works |
| Command Centre budget total | Excludes untracked projects, and says so |
| Cross-workspace rows returned by the isolation suite *(Phase 2)* | **0**, every deploy |
| Kofa PG regression after each phase | No failed flows, no data loss |
| Signup → first task created, median *(Phase 3)* | < 10 minutes |

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| The Phase 1 migration deletes 4 approved monthly-budget rows and 3 workstream allocations | Medium | They describe money nobody is spending; snapshot first, and the deletion is listed row-by-row in §3.6 |
| Flipping 154 historical time entries to non-billable | Medium | Flagged as an open decision, not assumed. Payroll uses `cost_rate` and is unaffected either way |
| The hour-allocation bypass (§3.5.1) is written too broadly and skips the budget check on client projects too | High | Condition on the project being untracked, not on the absence of a `workstream_budgets` row — an unallocated *client* month must still divert to a request |
| Phase 2's migration runs against the live database Kofa PG uses daily | High | Rehearse on a Supabase branch then a restored snapshot; the FK repoints are metadata-only, which keeps the window short |
| Invite-existing-user introduces a cross-tenant bug *(Phase 3)* | High | Dedicated tests; first thing the isolation suite exercises |

---

## 9. Open questions

1. **Historical billable flags** on the three internal projects — flip to
   non-billable, or leave and suppress in the UI? Recommendation in §3.6. Needed
   before the Phase 1 migration runs.
2. **Does the internal account need its own name**, or does "Kofa P/G" (the same
   string as the workspace) read fine? Later workspaces will want a default —
   the workspace name, or a literal "Internal".
3. **Should internal projects be excluded from utilization targets?** They count as
   hours today and would keep counting. Probably right, worth confirming.
4. **Open-ended client retainers** — same underlying need, deliberately excluded in
   §3.1. When does that get revisited?
5. **Owner role** *(Phase 3)* — a real role, or a flag on the membership? Leaning
   role.

---

## 10. Appendix — audit reference

Verified against the live database on 2026-08-30 (project `rhuwwmcmfmqgudcwzdyu`).

| Fact | Value |
|---|---|
| Base tables in `public` | 26, all with RLS enabled |
| Tables carrying `org_id` | 24 (all but `organizations`, `project_budget_alerts`) |
| Policies in `public` | 72; 68 begin `org_id = current_org_id()`. Of the rest, one is `organizations.org_read` (`id = current_org_id()`, the same check) and three are `notifications` |
| FK constraints referencing `profiles(id)` | 29, across 21 tables |
| Storage buckets | `deliverable-files` (private, org-scoped), `employee-files` (private, org-scoped), `avatars` (**public**, user-scoped) |
| `projects.budget_amount` / `length_months` | Both `NOT NULL` today, defaults `0` and `1` |
| Accounts | 11 (5 active); `Kofa P/G` holds the 3 internal projects |
| Internal projects' invented budgets | Kofa OS $67,300 / 12mo · Kofa Website $104,100 / 2mo · FY26 Media Planning $42,900 / 3mo |
| Rows the Phase 1 migration removes | 17 `project_monthly_budgets` (4 approved) + 3 `workstream_budgets` |
| Time entries on those projects | 172, of which 154 are flagged billable |
| Tables with RLS on and no policies | `project_budget_alerts` (deny-all by design) |
