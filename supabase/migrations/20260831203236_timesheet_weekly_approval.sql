-- ============================================================================
--  Weekly timesheet approval chain for contractors
--  ---------------------------------------------------------------------------
--  A contractor's logged time now has to walk a three-step chain before
--  finance is allowed to pay it:
--
--      workstream lead  ->  managing director (admin/executive)  ->  paid
--
--  The unit of approval is ONE PERSON x ONE WEEK x ONE WORKSTREAM. A
--  contractor who worked across Studio and PPC in the same week produces two
--  rows, so each lead only ever signs off the hours logged against their own
--  workstream's work, and the MD then clears each of those rows.
--
--  Weeks are not submitted by hand: ensure_timesheet_weeks() is called on
--  page load (the same idempotent pattern as ensure_pay_periods) and flips
--  any week that has finished from 'draft' to 'pending_lead'.
--
--  Only contractors (profiles.employment_type = 'contractor') are in scope.
--  Employees' time keeps flowing straight into payroll as before.
-- ============================================================================

create type public.timesheet_week_status as enum (
  'draft',        -- the week is still running; the person can still log/edit
  'pending_lead', -- week closed, waiting on the workstream lead
  'pending_md',   -- lead signed off, waiting on the managing director
  'approved',     -- cleared for payroll
  'rejected'      -- sent back with a comment; entries are editable again
);

-- ---------------------------------------------------------------- the weeks

create table public.timesheet_weeks (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references public.app_users(id) on delete cascade,
  /** Monday of the week, in UTC — matches time_entry_costs.entry_date, which
   *  is also derived in UTC, so hours never land in two different weeks
   *  depending on which view you look at. */
  week_start        date not null,
  /** The workstream these hours were logged against. Null is a real value:
   *  time logged with no task, by someone with no workstream of their own,
   *  has no lead to route to and falls to the MD instead. */
  department_id     uuid,
  status            public.timesheet_week_status not null default 'draft',
  submitted_at      timestamptz,
  lead_approved_by  uuid references public.app_users(id),
  lead_approved_at  timestamptz,
  md_approved_by    uuid references public.app_users(id),
  md_approved_at    timestamptz,
  rejected_by       uuid references public.app_users(id),
  rejected_at       timestamptz,
  rejection_comment text,
  /** Stamped once every day of the week sits inside a pay period this person
   *  has actually been paid for. A week straddling a period boundary stays
   *  unstamped until the second period is paid too. */
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint timesheet_weeks_department_fk
    foreign key (department_id, org_id) references public.departments(id, org_id),
  constraint timesheet_weeks_id_org_key unique (id, org_id)
);

-- NULLS NOT DISTINCT: the "no workstream" bucket must collapse to one row per
-- person per week, not one per insert attempt.
create unique index timesheet_weeks_unique
  on public.timesheet_weeks (org_id, user_id, week_start, department_id) nulls not distinct;

create index timesheet_weeks_status_idx on public.timesheet_weeks (org_id, status, week_start desc);
create index timesheet_weeks_user_idx   on public.timesheet_weeks (org_id, user_id, week_start desc);

create trigger timesheet_weeks_touch
  before update on public.timesheet_weeks
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------- audit trail

create table public.timesheet_week_reviews (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  timesheet_week_id uuid not null,
  actor_id          uuid references public.app_users(id),
  decision          text not null check (decision in ('lead_approve','md_approve','reject','resubmit','reopen')),
  comment           text,
  created_at        timestamptz not null default now(),
  constraint timesheet_week_reviews_week_fk
    foreign key (timesheet_week_id, org_id)
    references public.timesheet_weeks(id, org_id) on delete cascade
);

create index timesheet_week_reviews_week_idx
  on public.timesheet_week_reviews (timesheet_week_id, created_at desc);

-- ============================================================ week derivation

/** Monday of the week an instant falls in, in UTC. Kept as a function so the
 *  view, the lock trigger and the payroll gate can never drift apart on where
 *  a week starts. */
create or replace function public.timesheet_week_start(p_at timestamptz)
returns date
language sql stable
set search_path to ''
as $$ select (date_trunc('week', (p_at at time zone 'UTC')))::date $$;

/** Every finished time entry, tagged with the week and workstream it belongs
 *  to. The workstream comes from the entry's task; time logged without a task
 *  falls back to the person's own workstream, and can legitimately be null.
 *  A running timer (ended_at is null) is not part of any week yet. */
create or replace view public.v_time_entry_weeks
with (security_invoker = on) as
select
  te.id                                       as time_entry_id,
  te.org_id,
  te.user_id,
  public.timesheet_week_start(te.started_at)  as week_start,
  coalesce(t.department_id, pr.department_id) as department_id,
  (te.started_at at time zone 'UTC')::date    as entry_date,
  coalesce(te.duration_minutes, 0)            as duration_minutes
from public.time_entries te
left join public.tasks t   on t.id = te.task_id
left join public.profiles pr on pr.user_id = te.user_id and pr.org_id = te.org_id
where te.ended_at is not null;

-- ============================================================ who approves

/** The people who may sign off a week for a workstream: its dept_lead(s) by
 *  profile, plus anyone tagged in department_leads. Falls back to
 *  admin/executive when the workstream has no lead (or has no workstream at
 *  all) so a week can never get stuck with nobody able to action it. */
create or replace function public.timesheet_week_approvers(p_org uuid, p_department uuid)
returns uuid[]
language plpgsql stable security definer
set search_path to ''
as $$
declare v uuid[];
begin
  if p_department is not null then
    select array_agg(distinct pr.user_id) into v
    from public.profiles pr
    where pr.org_id = p_org
      and pr.is_active
      and ( (pr.department_id = p_department and pr.role = 'dept_lead')
         or exists (select 1 from public.department_leads dl
                     where dl.org_id = p_org
                       and dl.department_id = p_department
                       and dl.profile_id = pr.user_id) );
  end if;

  if v is null or cardinality(v) = 0 then
    select array_agg(distinct pr.user_id) into v
    from public.profiles pr
    where pr.org_id = p_org and pr.is_active and pr.role in ('admin','executive');
  end if;

  return coalesce(v, '{}'::uuid[]);
end $$;

-- ====================================================== keeping weeks in sync

/** Idempotent housekeeping, called on page load the same way
 *  ensure_pay_periods() is:
 *
 *    1. creates a week row for every (contractor, week, workstream) that has
 *       logged time and doesn't have one yet;
 *    2. auto-submits any 'draft' week that has finished — this is the
 *       "submission" step, so nobody has to remember to press a button;
 *    3. drops week rows that no longer have any time behind them (the person
 *       deleted or re-pointed every entry while it was still editable);
 *    4. notifies the workstream lead(s) about anything it just submitted.
 *
 *  Deliberately does NOT touch 'rejected' weeks — a returned week goes back
 *  up the chain only when the person resubmits it.
 */
create or replace function public.ensure_timesheet_weeks(p_weeks_back integer default 26)
returns integer
language plpgsql security definer
set search_path to ''
as $$
declare
  v_org  uuid := public.current_org_id();
  v_from date;
  v_new  integer := 0;
  f      record;
  u      uuid;
begin
  if v_org is null then return 0; end if;
  v_from := (date_trunc('week', current_date))::date - (greatest(p_weeks_back, 1) * 7);

  insert into public.timesheet_weeks (org_id, user_id, week_start, department_id)
  select w.org_id, w.user_id, w.week_start, w.department_id
    from public.v_time_entry_weeks w
    join public.profiles pr
      on pr.user_id = w.user_id and pr.org_id = w.org_id
   where w.org_id = v_org
     and pr.employment_type = 'contractor'
     and w.week_start >= v_from
   group by w.org_id, w.user_id, w.week_start, w.department_id
  on conflict (org_id, user_id, week_start, department_id) do nothing;
  get diagnostics v_new = row_count;

  -- an empty week is noise in someone's queue, so clear it out before submitting
  delete from public.timesheet_weeks tw
   where tw.org_id = v_org
     and tw.status in ('draft', 'pending_lead')
     and not exists (
       select 1 from public.v_time_entry_weeks w
        where w.org_id = tw.org_id
          and w.user_id = tw.user_id
          and w.week_start = tw.week_start
          and w.department_id is not distinct from tw.department_id);

  for f in
    update public.timesheet_weeks
       set status = 'pending_lead', submitted_at = now()
     where org_id = v_org
       and status = 'draft'
       and week_start + 7 <= current_date
    returning *
  loop
    foreach u in array public.timesheet_week_approvers(f.org_id, f.department_id) loop
      insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
      select f.org_id, u, 'timesheet_submitted',
             pr.full_name || ' — week of ' || to_char(f.week_start, 'Mon DD'),
             coalesce(d.name, 'No workstream') || ' · awaiting your approval',
             'timesheet_week', f.id
        from public.profiles pr
        left join public.departments d on d.id = f.department_id
       where pr.user_id = f.user_id and pr.org_id = f.org_id;
    end loop;
  end loop;

  return v_new;
end $$;

-- ======================================================== locking the entries

/** Once a week has left 'draft'/'rejected' its hours are evidence in an
 *  approval, so nothing may add to, change or remove them — not the person,
 *  not their lead, not an admin. The way back is decide_timesheet_week()
 *  with 'reject' (or 'reopen'), which unlocks the week explicitly and leaves
 *  a record of who unlocked it and why. */
/** Raises if the (user, week, workstream) the entry falls into is locked.
 *  Shared by the row-level trigger below for both the old and the new side
 *  of an update, since an edit can move an entry between two weeks. */
create or replace function public.assert_timesheet_week_open(
  p_org uuid, p_user uuid, p_started_at timestamptz, p_task_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_dept  uuid;
  v_week  public.timesheet_weeks;
  v_label text;
begin
  select coalesce(t.department_id, pr.department_id) into v_dept
    from public.profiles pr
    left join public.tasks t on t.id = p_task_id
   where pr.user_id = p_user and pr.org_id = p_org;

  select * into v_week
    from public.timesheet_weeks
   where org_id = p_org
     and user_id = p_user
     and week_start = public.timesheet_week_start(p_started_at)
     and department_id is not distinct from v_dept;

  if not found or v_week.status in ('draft', 'rejected') then
    return;
  end if;

  v_label := case v_week.status
    when 'pending_lead' then 'is with the workstream lead for approval'
    when 'pending_md'   then 'is with the managing director for approval'
    when 'approved'     then 'has been approved for payroll'
    else 'is locked' end;

  raise exception 'The timesheet week of % % — its time can no longer be changed. Ask an approver to send the week back first.',
    to_char(v_week.week_start, 'Mon DD, YYYY'), v_label;
end $$;

create or replace function public.time_entry_week_guard()
returns trigger
language plpgsql security definer
set search_path to ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_timesheet_week_open(old.org_id, old.user_id, old.started_at, old.task_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_timesheet_week_open(
      coalesce(new.org_id, (select org_id from public.projects where id = new.project_id)),
      new.user_id, new.started_at, new.task_id);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Runs after time_entry_before_write (alphabetical order on BEFORE triggers),
-- so new.org_id is already populated by the time the guard reads it.
create trigger time_entry_week_guard
  before insert or update or delete on public.time_entries
  for each row execute function public.time_entry_week_guard();
