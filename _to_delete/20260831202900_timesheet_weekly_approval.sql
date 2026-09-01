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

-- ============================================================== the decisions

/** The single write path for a timesheet week. Every state change goes
 *  through here so the guard rails (who may act, from which state, and
 *  whether a comment is required) can't be side-stepped by a table write.
 *
 *    lead_approve  pending_lead -> pending_md   workstream lead
 *    md_approve    pending_md   -> approved     admin / executive (the MD)
 *    reject        any open     -> rejected     lead or MD, comment required
 *    resubmit      rejected     -> pending_lead the person themselves
 *    reopen        approved     -> pending_lead admin / executive
 */
create or replace function public.decide_timesheet_week(
  p_week_id uuid, p_decision text, p_comment text default null)
returns public.timesheet_weeks
language plpgsql security definer
set search_path to ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_me      record;
  w         public.timesheet_weeks;
  v_row     public.timesheet_weeks;
  v_dec     text := lower(btrim(coalesce(p_decision, '')));
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_is_lead boolean;
  v_dept    text;
  v_label   text;
  u         uuid;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;

  select user_id, org_id, role, full_name into v_me
    from public.profiles
   where user_id = v_actor and org_id = public.current_org_id();
  if not found then raise exception 'No profile for this user'; end if;

  select * into w from public.timesheet_weeks
   where id = p_week_id and org_id = v_me.org_id;
  if not found then raise exception 'Timesheet week not found'; end if;

  if w.paid_at is not null then
    raise exception 'This week has already been paid and can no longer be changed';
  end if;

  v_is_lead := public.is_admin_or_executive()
            or v_actor = any (public.timesheet_week_approvers(w.org_id, w.department_id));

  select coalesce(d.name, 'No workstream') into v_dept
    from (select 1) x left join public.departments d on d.id = w.department_id;

  if v_dec = 'lead_approve' then
    if w.status <> 'pending_lead' then
      raise exception 'This week is not waiting on workstream approval';
    end if;
    if w.user_id = v_actor then raise exception 'You cannot approve your own timesheet'; end if;
    if not v_is_lead then raise exception 'Only this workstream''s lead can approve these hours'; end if;

    update public.timesheet_weeks
       set status = 'pending_md', lead_approved_by = v_actor, lead_approved_at = now(),
           rejected_by = null, rejected_at = null, rejection_comment = null
     where id = w.id returning * into v_row;

  elsif v_dec = 'md_approve' then
    if w.status <> 'pending_md' then
      raise exception 'This week is not waiting on managing director approval';
    end if;
    if w.user_id = v_actor then raise exception 'You cannot approve your own timesheet'; end if;
    if not public.is_admin_or_executive() then
      raise exception 'Only the managing director can give final approval';
    end if;

    update public.timesheet_weeks
       set status = 'approved', md_approved_by = v_actor, md_approved_at = now()
     where id = w.id returning * into v_row;

  elsif v_dec = 'reject' then
    if w.status not in ('pending_lead', 'pending_md', 'approved') then
      raise exception 'Only a submitted week can be sent back';
    end if;
    if not v_is_lead then raise exception 'You are not authorized to review this week'; end if;
    if v_comment is null then
      raise exception 'Say what needs fixing — a comment is required when sending a week back';
    end if;

    update public.timesheet_weeks
       set status = 'rejected', rejected_by = v_actor, rejected_at = now(),
           rejection_comment = v_comment, submitted_at = null,
           lead_approved_by = null, lead_approved_at = null,
           md_approved_by = null, md_approved_at = null
     where id = w.id returning * into v_row;

  elsif v_dec = 'resubmit' then
    if w.status <> 'rejected' then raise exception 'Only a returned week can be resubmitted'; end if;
    if w.user_id <> v_actor and not public.is_admin_or_executive() then
      raise exception 'Only the person whose week this is can resubmit it';
    end if;

    update public.timesheet_weeks
       set status = 'pending_lead', submitted_at = now(),
           rejected_by = null, rejected_at = null, rejection_comment = null
     where id = w.id returning * into v_row;

  elsif v_dec = 'reopen' then
    if not public.is_admin_or_executive() then
      raise exception 'Only an admin or executive can reopen an approved week';
    end if;
    if w.status <> 'approved' then raise exception 'Only an approved week can be reopened'; end if;

    update public.timesheet_weeks
       set status = 'pending_lead', submitted_at = now(),
           lead_approved_by = null, lead_approved_at = null,
           md_approved_by = null, md_approved_at = null
     where id = w.id returning * into v_row;

  else
    raise exception 'Unknown decision: %', p_decision;
  end if;

  insert into public.timesheet_week_reviews (org_id, timesheet_week_id, actor_id, decision, comment)
  values (v_me.org_id, w.id, v_actor, v_dec, v_comment);

  -- Who hears about it: forward steps ping the next approver, anything that
  -- lands back on the person pings the person.
  if v_dec in ('lead_approve') then
    for u in select pr.user_id from public.profiles pr
              where pr.org_id = w.org_id and pr.is_active and pr.role in ('admin','executive')
    loop
      insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
      select w.org_id, u, 'timesheet_submitted',
             pr.full_name || ' — week of ' || to_char(w.week_start, 'Mon DD'),
             v_dept || ' · approved by ' || v_me.full_name || ', awaiting final sign-off',
             'timesheet_week', w.id
        from public.profiles pr where pr.user_id = w.user_id and pr.org_id = w.org_id;
    end loop;

  elsif v_dec in ('resubmit') then
    foreach u in array public.timesheet_week_approvers(w.org_id, w.department_id) loop
      insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
      select w.org_id, u, 'timesheet_submitted',
             pr.full_name || ' — week of ' || to_char(w.week_start, 'Mon DD') || ' (resubmitted)',
             v_dept || ' · awaiting your approval',
             'timesheet_week', w.id
        from public.profiles pr where pr.user_id = w.user_id and pr.org_id = w.org_id;
    end loop;

  else
    v_label := case v_dec
      when 'md_approve' then 'Approved: week of ' || to_char(w.week_start, 'Mon DD')
      when 'reject'     then 'Sent back: week of ' || to_char(w.week_start, 'Mon DD')
      when 'reopen'     then 'Reopened: week of ' || to_char(w.week_start, 'Mon DD')
      end;
    insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
    values (w.org_id, w.user_id, 'timesheet_decided', v_label,
            v_dept || ' · ' || coalesce(v_comment, 'by ' || v_me.full_name),
            'timesheet_week', w.id);
  end if;

  return v_row;
end $$;

-- ==================================================================== views

/** What every queue in the UI reads: the week plus who it belongs to, which
 *  workstream it is, how much time sits in it, and the names behind each
 *  approval stamp. cost_amount comes from time_entry_costs, which is itself
 *  RLS'd to people with financial access — so a contractor reading their own
 *  row simply sees 0 there rather than being refused the row. */
create or replace view public.v_timesheet_weeks
with (security_invoker = on) as
select
  w.id, w.org_id, w.user_id, w.week_start, w.department_id, w.status,
  w.submitted_at, w.lead_approved_by, w.lead_approved_at,
  w.md_approved_by, w.md_approved_at,
  w.rejected_by, w.rejected_at, w.rejection_comment, w.paid_at,
  w.created_at, w.updated_at,
  pr.full_name  as user_name,
  d.name        as department_name,
  d.color       as department_color,
  coalesce(agg.total_minutes, 0)::integer as total_minutes,
  coalesce(agg.entry_count, 0)::integer   as entry_count,
  coalesce(cost.cost_amount, 0)::numeric  as cost_amount,
  lead_p.full_name as lead_approved_by_name,
  md_p.full_name   as md_approved_by_name,
  rej_p.full_name  as rejected_by_name
from public.timesheet_weeks w
left join public.profiles    pr on pr.user_id = w.user_id and pr.org_id = w.org_id
left join public.departments d  on d.id = w.department_id
left join lateral (
  select sum(e.duration_minutes) as total_minutes, count(*) as entry_count
    from public.v_time_entry_weeks e
   where e.org_id = w.org_id and e.user_id = w.user_id
     and e.week_start = w.week_start
     and e.department_id is not distinct from w.department_id
) agg on true
left join lateral (
  select sum(c.cost_amount) as cost_amount
    from public.v_time_entry_weeks e
    join public.time_entry_costs c on c.time_entry_id = e.time_entry_id
   where e.org_id = w.org_id and e.user_id = w.user_id
     and e.week_start = w.week_start
     and e.department_id is not distinct from w.department_id
) cost on true
left join public.profiles lead_p on lead_p.user_id = w.lead_approved_by and lead_p.org_id = w.org_id
left join public.profiles md_p   on md_p.user_id   = w.md_approved_by   and md_p.org_id   = w.org_id
left join public.profiles rej_p  on rej_p.user_id  = w.rejected_by      and rej_p.org_id  = w.org_id;

-- ====================================================================== RLS

alter table public.timesheet_weeks        enable row level security;
alter table public.timesheet_week_reviews enable row level security;

-- Read only. Every state change goes through decide_timesheet_week() /
-- ensure_timesheet_weeks(), so there are deliberately no write policies.
create policy timesheet_weeks_read on public.timesheet_weeks
  for select using (
    org_id = public.current_org_id()
    and ( user_id = (select auth.uid())
       or public.is_lead_or_admin()
       or public.has_financial_access() )
  );

create policy timesheet_week_reviews_read on public.timesheet_week_reviews
  for select using (
    org_id = public.current_org_id()
    and ( public.is_lead_or_admin()
       or public.has_financial_access()
       or exists (select 1 from public.timesheet_weeks w
                   where w.id = timesheet_week_id and w.user_id = (select auth.uid())) )
  );

grant select on public.timesheet_weeks        to authenticated;
grant select on public.timesheet_week_reviews to authenticated;
grant select on public.v_timesheet_weeks      to authenticated;
grant select on public.v_time_entry_weeks     to authenticated;

-- ========================================================= the payroll gate

/** Human-readable list of the weeks standing between a contractor and their
 *  pay, or null when nothing is. Used by both payment entry points so the
 *  error message tells finance exactly what to chase. */
create or replace function public.unapproved_timesheet_weeks(
  p_org uuid, p_user uuid, p_from date, p_to date)
returns text
language sql stable security definer
set search_path to ''
as $$
  select string_agg(
           to_char(w.week_start, 'Mon DD') ||
           coalesce(' (' || d.name || ')', '') ||
           ' — ' || (case w.status
                       when 'draft'        then 'still open'
                       when 'pending_lead' then 'awaiting workstream lead'
                       when 'pending_md'   then 'awaiting managing director'
                       when 'rejected'     then 'sent back, not resubmitted'
                       else w.status::text end),
           '; ' order by w.week_start)
    from public.timesheet_weeks w
    left join public.departments d on d.id = w.department_id
   where w.org_id = p_org
     and w.user_id = p_user
     and w.status <> 'approved'
     and exists (
       select 1 from public.v_time_entry_weeks e
        where e.org_id = w.org_id and e.user_id = w.user_id
          and e.week_start = w.week_start
          and e.department_id is not distinct from w.department_id
          and e.entry_date between p_from and p_to)
$$;

/** Bookkeeping only — records that someone was paid. Now also the third and
 *  final gate of the approval chain: a contractor's hours have to have
 *  cleared their workstream lead AND the managing director before finance
 *  can mark them paid. Employees are unaffected. */
create or replace function public.record_payroll_payment(
  p_period_id uuid, p_profile_id uuid, p_amount numeric, p_notes text default null)
returns public.payroll_payments
language plpgsql security definer
set search_path to ''
as $$
declare
  v_row      public.payroll_payments;
  v_period   public.pay_periods;
  v_amount   numeric;
  v_org      uuid := public.current_org_id();
  v_person   record;
  v_blocked  text;
begin
  if not public.has_financial_access() then
    raise exception 'Not authorized to record a payroll payment';
  end if;

  select * into v_period from public.pay_periods
   where id = p_period_id and org_id = v_org;
  if not found then raise exception 'Pay period not found'; end if;

  if v_period.period_end >= current_date then
    raise exception 'Cannot record a payment for a pay period that has not ended yet (ends %)', v_period.period_end;
  end if;

  select full_name, employment_type into v_person
    from public.profiles where user_id = p_profile_id and org_id = v_org;
  if not found then raise exception 'Profile not found'; end if;

  if v_person.employment_type = 'contractor' then
    perform public.ensure_timesheet_weeks();
    v_blocked := public.unapproved_timesheet_weeks(
                   v_org, p_profile_id, v_period.period_start, v_period.period_end);
    if v_blocked is not null then
      raise exception '% has time in this period that is not fully approved yet: %. Every week needs the workstream lead and then the managing director before it can be paid.',
        v_person.full_name, v_blocked;
    end if;
  end if;

  select coalesce(sum(cost_amount), 0) into v_amount
    from public.time_entry_costs
   where user_id = p_profile_id
     and org_id = v_org
     and entry_date between v_period.period_start and v_period.period_end;

  insert into public.payroll_payments (org_id, pay_period_id, profile_id, amount, paid_by, notes)
  values (v_org, p_period_id, p_profile_id, v_amount, (select auth.uid()), p_notes)
  returning * into v_row;

  -- Stamp any week now fully covered by paid periods. A week straddling a
  -- period boundary waits for the other half to be paid too.
  update public.timesheet_weeks w
     set paid_at = now()
   where w.org_id = v_org
     and w.user_id = p_profile_id
     and w.status = 'approved'
     and w.paid_at is null
     and not exists (
       select 1
         from generate_series(w.week_start, w.week_start + 6, interval '1 day') g(d)
        where not exists (
          select 1 from public.pay_periods pp
            join public.payroll_payments pay
              on pay.pay_period_id = pp.id and pay.profile_id = p_profile_id
           where pp.org_id = v_org
             and g.d::date between pp.period_start and pp.period_end));

  return v_row;
end $$;

/** Closing a whole period is finance's other way of saying "paid", so it
 *  carries the same gate: no contractor may still have unapproved time in it. */
create or replace function public.mark_pay_period_paid(p_period_id uuid)
returns public.pay_periods
language plpgsql security definer
set search_path to ''
as $$
declare
  v_row     public.pay_periods;
  v_org     uuid := public.current_org_id();
  v_period  public.pay_periods;
  v_blocked text;
  v_names   text;
begin
  if not public.has_financial_access() then
    raise exception 'Not authorized to close a pay period';
  end if;

  select * into v_period from public.pay_periods where id = p_period_id and org_id = v_org;
  if not found then raise exception 'Pay period not found'; end if;

  perform public.ensure_timesheet_weeks();

  select string_agg(pr.full_name, ', ' order by pr.full_name) into v_names
    from public.profiles pr
   where pr.org_id = v_org
     and pr.employment_type = 'contractor'
     and public.unapproved_timesheet_weeks(v_org, pr.user_id, v_period.period_start, v_period.period_end) is not null;

  if v_names is not null then
    raise exception 'Cannot close this period — time is still awaiting approval for: %', v_names;
  end if;

  update public.pay_periods
     set status = 'paid', paid_at = now(), paid_by = (select auth.uid())
   where id = p_period_id and org_id = v_org
  returning * into v_row;

  return v_row;
end $$;

-- ================================================== workspace reset awareness

/** Unchanged except for the two new tables: they are archived alongside
 *  everything else, and — importantly — deleted BEFORE time_entries, since
 *  the week guard would otherwise refuse to let an approved week's entries go. */
create or replace function public.reset_workspace()
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_org     uuid := public.current_org_id();
  v_me      uuid := (select auth.uid());
  v_archive jsonb;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_org is null then raise exception 'No active workspace'; end if;

  if not (public.is_platform_admin() or public.is_workspace_owner()) then
    raise exception 'Only a workspace owner or platform staff can reset a workspace';
  end if;

  select jsonb_build_object(
    'accounts',                  (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.accounts t where t.org_id = v_org and not t.is_internal),
    'account_share_links',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.account_share_links t where t.org_id = v_org),
    'projects',                  (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.projects t where t.org_id = v_org),
    'tasks',                     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tasks t where t.org_id = v_org),
    'task_assignees',            (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.task_assignees t where t.org_id = v_org),
    'task_hour_allocations',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.task_hour_allocations t where t.org_id = v_org),
    'task_time_requests',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.task_time_requests t where t.org_id = v_org),
    'time_entries',              (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.time_entries t where t.org_id = v_org),
    'time_entry_costs',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.time_entry_costs t where t.org_id = v_org),
    'timesheet_weeks',           (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.timesheet_weeks t where t.org_id = v_org),
    'timesheet_week_reviews',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.timesheet_week_reviews t where t.org_id = v_org),
    'deliverables',              (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.deliverables t where t.org_id = v_org),
    'deliverable_attachments',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.deliverable_attachments t where t.org_id = v_org),
    'deliverable_comments',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.deliverable_comments t where t.org_id = v_org),
    'deliverable_reviews',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.deliverable_reviews t where t.org_id = v_org),
    'project_monthly_budgets',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.project_monthly_budgets t where t.org_id = v_org),
    'workstream_budgets',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.workstream_budgets t where t.org_id = v_org),
    'workstream_budget_requests',(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.workstream_budget_requests t where t.org_id = v_org),
    'payroll_payments',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.payroll_payments t where t.org_id = v_org),
    'pay_periods',               (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pay_periods t where t.org_id = v_org),
    'notifications',             (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.notifications t where t.org_id = v_org)
  ) into v_archive;

  insert into public.workspace_reset_archives (org_id, reset_by, data)
  values (v_org, v_me, v_archive);

  delete from public.deliverable_attachments   where org_id = v_org;
  delete from public.deliverable_comments      where org_id = v_org;
  delete from public.deliverable_reviews       where org_id = v_org;
  delete from public.deliverables              where org_id = v_org;
  delete from public.task_hour_allocations     where org_id = v_org;
  delete from public.task_assignees            where org_id = v_org;
  delete from public.task_time_requests        where org_id = v_org;
  delete from public.timesheet_week_reviews    where org_id = v_org;
  delete from public.timesheet_weeks           where org_id = v_org;
  delete from public.tasks                     where org_id = v_org;
  delete from public.time_entry_costs          where org_id = v_org;
  delete from public.time_entries              where org_id = v_org;
  delete from public.project_monthly_budgets   where org_id = v_org;
  delete from public.workstream_budget_requests where org_id = v_org;
  delete from public.workstream_budgets        where org_id = v_org;
  delete from public.payroll_payments          where org_id = v_org;
  delete from public.pay_periods               where org_id = v_org;
  delete from public.account_share_links       where org_id = v_org;
  delete from public.projects                  where org_id = v_org;
  delete from public.accounts                  where org_id = v_org and not is_internal;
  delete from public.notifications             where org_id = v_org;

  perform public.ensure_pay_periods(12, 2);
end $$;

-- ============================================================== backfill

-- Bring existing contractor time into the chain, but do NOT retroactively
-- lock or auto-approve anything: past weeks land in 'pending_lead' so the
-- leads and the MD walk them once, and nothing that was already paid is
-- touched (those weeks are stamped straight to 'approved' + paid).
do $$
declare v_org uuid;
begin
  for v_org in select id from public.organizations loop
    insert into public.timesheet_weeks (org_id, user_id, week_start, department_id)
    select w.org_id, w.user_id, w.week_start, w.department_id
      from public.v_time_entry_weeks w
      join public.profiles pr on pr.user_id = w.user_id and pr.org_id = w.org_id
     where w.org_id = v_org and pr.employment_type = 'contractor'
     group by w.org_id, w.user_id, w.week_start, w.department_id
    on conflict (org_id, user_id, week_start, department_id) do nothing;
  end loop;

  -- Weeks already covered by a recorded payroll payment are history, not a queue.
  update public.timesheet_weeks w
     set status = 'approved', submitted_at = w.created_at,
         lead_approved_at = w.created_at, md_approved_at = w.created_at, paid_at = now()
   where not exists (
     select 1
       from generate_series(w.week_start, w.week_start + 6, interval '1 day') g(d)
      where not exists (
        select 1 from public.pay_periods pp
          join public.payroll_payments pay
            on pay.pay_period_id = pp.id and pay.profile_id = w.user_id
         where pp.org_id = w.org_id
           and g.d::date between pp.period_start and pp.period_end));

  -- Everything else that has finished goes into the leads' queue.
  update public.timesheet_weeks
     set status = 'pending_lead', submitted_at = now()
   where status = 'draft' and week_start + 7 <= current_date;
end $$;
