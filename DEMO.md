# Kofa OS — investor demo script

**Runtime: 6–7 minutes.** Password for every login: `KofaDemo2026!`

The whole demo answers one question: *does Kofa know where its people's time goes,
and what it's worth?* Follow the loop — **assign → track → deliver → approve → see the money.**

## Before you start

- Open two browser windows: one normal, one private (for the client portal).
- Sign in as `jules@kofapg.com` in the normal window.
- Copy the Meridian Health Group client link now: **Accounts → Copy client link**.
  Paste it into the private window's address bar but don't hit enter yet.
- Do **not** log time against *Q3 Brand Refresh* beforehand — it sits at 96% on purpose.

---

## 1. The staff view (60s) — `jules@kofapg.com`

"This is a designer's Monday morning."

- My Work: hours this week, open tasks, overdue, and what's waiting on them.
- Flip **List → Board → Calendar**. Same tasks, three ways to think about them.
- **Point out what's missing:** no rates, no margin anywhere. Open any project's
  Budget tab — hours in full, money shows "Restricted".

> If someone technical pushes: that isn't the UI hiding it. Rates live in a separate
> table that staff have no read access to, so the numbers never leave the database.

## 2. Track time (45s)

- Header → **Start timer** → pick one of their open tasks → Start.
- Let it run. "That timer survives a refresh and a laptop reboot — it's a row in the
  database with no end time, not browser state."
- Stop it. Note it lands on the timesheet immediately.

## 3. The money moment (90s) — switch to `amara@kofapg.com`

This is the centrepiece. Same data, leadership's eyes.

- **Command centre**: $751k active budget, 2 projects at risk, utilization by person.
- Go to **Projects → Q3 Brand Refresh**. It's at **96% of budget**.
- **Timesheet → Log time** → Q3 Brand Refresh → **12 hours** → "Final brand review".
- Watch: a red **budget alert toast appears live**, no refresh. The bell increments.
- Back to the project: spend has moved by exactly 12 × $225 = **$2,700**, and it's
  now over budget. Projected overrun updates too.

> "Nobody filed a report. One person logged their afternoon, and the account lead and
> both directors already know the project went over."

## 4. Deliverables and the audit trail (90s)

- **Deliverables** → the review pipeline, and "Waiting on you".
- Open **Rider journey findings deck** (Approved column). Scroll to **History**:
  submitted → rejected with a written reason → reworked → approved by the client.
  Five timestamped steps, every one attributed.
- "This is the transparency piece. You can't move a deliverable without leaving a
  record — the database rejects any attempt to change a stage outside the workflow,
  and nobody can approve their own work."

## 5. The client sees it too (60s)

- Switch to the private window, load the portal link.
- No login. The client sees budget consumed as a **percentage**, project status, and
  what's waiting on them — never a rate, never a dollar figure.
- Click **Approve** on *Logo system final files*.
- Switch back to the Kofa window → the deliverable has moved to Approved and the
  owner has been notified.

## 6. Close (30s)

"Four things in one system: the work, the hours, the delivery, and the money — and
they're the same data, not four tools stitched together. Next phase adds CRM, payroll
through Deel, SOPs, and Google Workspace."

---

## Resetting between runs

Steps 3 and 5 consume their demo moments. To reset, run in the Supabase SQL editor:

```sql
-- Undo the live time entry so Q3 Brand Refresh returns to ~96%
delete from public.time_entries where description = 'Final brand review with client';
delete from public.project_budget_alerts
  where project_id = (select id from public.projects where code = 'MHG-BR3') and threshold = 100;
delete from public.notifications where title = 'Q3 Brand Refresh is at 100% of budget';

-- Put the client-approved deliverable back in the client's queue
do $$
declare v_id uuid;
begin
  select id into v_id from public.deliverables where title = 'Logo system final files';
  delete from public.deliverable_reviews where deliverable_id = v_id and actor_label like '%(client)%';
  delete from public.notifications where entity_id = v_id and type = 'deliverable_approved';
  perform set_config('kofa.stage_transition', 'on', true);
  update public.deliverables set stage = 'client_review', approved_at = null where id = v_id;
  perform set_config('kofa.stage_transition', 'off', true);
end $$;
```

## If something goes wrong

- **Toast doesn't appear**: the notification is still written — open the bell, it's there.
  Realtime needs a live websocket; a flaky venue network is the usual culprit.
- **Client link 404s on refresh**: the Netlify SPA redirect isn't deployed. Check
  `public/_redirects` shipped in `dist`.
- **Magic link bounces to localhost**: add the Netlify URL to Supabase → Authentication
  → URL Configuration. Password login is unaffected — prefer it on stage.
