-- Deliverable-based tracking, part 2: the behaviour on top of the schema in
-- 20260904140000_deliverable_tracking_schema.sql. Applied live 2026-09-04.
--
-- Money model, deliberately parallel to the hours model:
--   hours:       task_hour_allocations       -> hours x cost_rate -> time_entry_costs -> payroll
--   deliverable: deliverable_fee_allocations -> flat fee, earned on acceptance -> payroll
-- Both commit against the same workstream monthly budget, and for contractors
-- both are paid only after the week clears lead -> managing director.

-- ------------------------------------------------------------ assignment
-- Allocating a fee is what puts someone on a deliverable-tracked task, the
-- same way allocating hours does on a time-tracked one (see
-- task_hour_allocation_sync_assignee). Without this, nothing writes
-- task_assignees for these tasks and My Work / notifications / Profile stats
-- would all go blank for them.
create or replace function public.deliverable_fee_sync_assignee()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare v_task uuid;
begin
  select d.task_id into v_task from public.deliverables d where d.id = new.deliverable_id;
  if v_task is null then return new; end if;

  insert into public.task_assignees (task_id, profile_id, org_id, added_by)
  values (v_task, new.profile_id, new.org_id, new.created_by)
  on conflict (task_id, profile_id) do nothing;
  return new;
end $$;

create or replace function public.deliverable_fee_unsync_assignee()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare v_task uuid;
begin
  select d.task_id into v_task from public.deliverables d where d.id = old.deliverable_id;
  if v_task is null then return old; end if;

  -- Only drop the assignment once this person has no fee AND no hours left on
  -- the task in any month -- a task can legitimately hold both if its mode was
  -- switched, and one deliverable of several finishing is not an unassignment.
  if not exists (
        select 1 from public.deliverable_fee_allocations fa
          join public.deliverables d2 on d2.id = fa.deliverable_id
         where d2.task_id = v_task and fa.profile_id = old.profile_id
           and fa.id <> old.id)
     and not exists (
        select 1 from public.task_hour_allocations tha
         where tha.task_id = v_task and tha.profile_id = old.profile_id)
  then
    delete from public.task_assignees where task_id = v_task and profile_id = old.profile_id;
  end if;
  return old;
end $$;

drop trigger if exists deliverable_fee_allocations_sync_assignee on public.deliverable_fee_allocations;
create trigger deliverable_fee_allocations_sync_assignee
  after insert on public.deliverable_fee_allocations
  for each row execute function public.deliverable_fee_sync_assignee();

drop trigger if exists deliverable_fee_allocations_unsync_assignee on public.deliverable_fee_allocations;
create trigger deliverable_fee_allocations_unsync_assignee
  after delete on public.deliverable_fee_allocations
  for each row execute function public.deliverable_fee_unsync_assignee();

-- ------------------------------------------------------- fee -> week map
-- An accepted fee is earned in the week it was ACCEPTED, not the week the work
-- happened or the budget month it was committed to. That mirrors how the money
-- actually behaves: the lead's acceptance is the event that makes it payable,
-- and keying off it means un-accepting cleanly withdraws it from the week again.
create or replace view public.v_deliverable_fee_weeks
with (security_invoker = on) as
  select fa.id                                       as allocation_id,
         fa.org_id,
         fa.profile_id                               as user_id,
         fa.department_id,
         fa.budget_month,
         fa.amount,
         public.timesheet_week_start(d.accepted_at)  as week_start,
         ((d.accepted_at at time zone 'UTC'))::date  as earned_date,
         d.id                                        as deliverable_id,
         d.title                                     as deliverable_title,
         d.project_id,
         p.name                                      as project_name
    from public.deliverable_fee_allocations fa
    join public.deliverables d on d.id = fa.deliverable_id
    left join public.projects p on p.id = d.project_id
   where d.accepted_at is not null;

comment on view public.v_deliverable_fee_weeks is
  'Every earned (accepted) deliverable fee, mapped onto the timesheet week it becomes payable in. The deliverable-side twin of v_time_entry_weeks.';

-- --------------------------------------------------- workstream budget
-- committed_amount now spans both tracking modes: hours x cost_rate for
-- time-tracked work, plus flat fees for deliverable-tracked work. A fee counts
-- from the moment it is allocated (not when accepted), exactly like hours do --
-- committing is a forward promise of the workstream's money either way.
create or replace view public.v_workstream_budget as
  select wb.id,
         wb.org_id,
         wb.project_id,
         wb.month,
         wb.department_id,
         d.name as department_name,
         wb.amount as allocated_amount,
         (coalesce(c.committed_amount, 0::numeric) + coalesce(f.fee_amount, 0::numeric)) as committed_amount,
         (wb.amount - coalesce(c.committed_amount, 0::numeric) - coalesce(f.fee_amount, 0::numeric)) as remaining_amount
    from public.workstream_budgets wb
    join public.departments d on d.id = wb.department_id
    left join lateral (
      select sum(tha.hours * coalesce(pr.cost_rate, 0::numeric)) as committed_amount
        from public.task_hour_allocations tha
        join public.tasks t on t.id = tha.task_id
        left join public.profile_rates pr on pr.profile_id = tha.profile_id
       where t.project_id = wb.project_id
         and tha.department_id = wb.department_id
         and tha.budget_month = wb.month) c on true
    left join lateral (
      select sum(fa.amount) as fee_amount
        from public.deliverable_fee_allocations fa
        join public.deliverables dl on dl.id = fa.deliverable_id
       where dl.project_id = wb.project_id
         and fa.department_id = wb.department_id
         and fa.budget_month = wb.month) f on true;

-- --------------------------------------------------------- acceptance
-- Acceptance is deliberately NOT the client-facing stage board. `stage` tracks
-- the client review flow; accepted_at is the internal money event, and only it
-- makes a fee earned and payable.
create or replace function public.accept_deliverable(p_deliverable_id uuid, p_comment text default null)
returns public.deliverables
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_org     uuid;
  v_me      record;
  d         public.deliverables;
  t         public.tasks;
  v_week    public.timesheet_weeks;
  v_start   date;
  f         record;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  v_org := public.current_org_id();

  select user_id, full_name into v_me
    from public.profiles where user_id = v_actor and org_id = v_org and is_active;
  if not found then raise exception 'No profile for this user'; end if;

  select * into d from public.deliverables where id = p_deliverable_id and org_id = v_org;
  if not found then raise exception 'Deliverable not found'; end if;
  if d.accepted_at is not null then raise exception 'This deliverable has already been accepted'; end if;
  if d.task_id is null then
    raise exception 'Only a deliverable attached to a task can be accepted for payment';
  end if;

  select * into t from public.tasks where id = d.task_id and org_id = v_org;
  if not found then raise exception 'The task behind this deliverable no longer exists'; end if;
  if t.tracking_mode <> 'deliverable' then
    raise exception 'This task is tracked by time, not by deliverables -- its work is paid through hours';
  end if;

  -- Same authority as approving that workstream's timesheet week: its lead(s),
  -- or an admin/executive. timesheet_week_approvers() already falls back to
  -- admin/executive when a workstream has no lead.
  if not (public.is_admin_or_executive()
          or v_actor = any (public.timesheet_week_approvers(v_org, t.department_id))) then
    raise exception 'Only this workstream''s lead, or an admin, can accept a deliverable';
  end if;

  if not exists (select 1 from public.deliverable_fee_allocations where deliverable_id = d.id) then
    raise exception 'Set who is paid for this deliverable, and how much, before accepting it';
  end if;

  -- Mirrors "You cannot approve your own timesheet" in decide_timesheet_week().
  if exists (select 1 from public.deliverable_fee_allocations
              where deliverable_id = d.id and profile_id = v_actor) then
    raise exception 'You cannot accept a deliverable you are being paid for';
  end if;

  v_start := public.timesheet_week_start(now());

  -- Don't let money land in a week that has already left the earner's hands,
  -- the same rule assert_timesheet_week_open() applies to time entries.
  for f in select distinct fa.profile_id, fa.department_id
             from public.deliverable_fee_allocations fa where fa.deliverable_id = d.id
  loop
    select * into v_week from public.timesheet_weeks
     where org_id = v_org and user_id = f.profile_id
       and week_start = v_start
       and department_id is not distinct from f.department_id;
    if found and v_week.status in ('pending_lead', 'pending_md', 'approved') then
      raise exception 'The current timesheet week for % is already in approval -- send it back before accepting more work into it.',
        (select full_name from public.profiles where user_id = f.profile_id and org_id = v_org);
    end if;
    if found and v_week.paid_at is not null then
      raise exception 'The current timesheet week for % has already been paid.',
        (select full_name from public.profiles where user_id = f.profile_id and org_id = v_org);
    end if;
  end loop;

  update public.deliverables
     set accepted_at = now(), accepted_by = v_actor
   where id = d.id
  returning * into d;

  -- Open the week the fee will be paid in. Contractors only: employees are not
  -- in the weekly approval chain at all (ensure_timesheet_weeks filters the
  -- same way), so their fee goes straight to payroll on acceptance.
  insert into public.timesheet_weeks (org_id, user_id, week_start, department_id)
  select v_org, fa.profile_id, v_start, fa.department_id
    from public.deliverable_fee_allocations fa
    join public.profiles pr on pr.user_id = fa.profile_id and pr.org_id = v_org
   where fa.deliverable_id = d.id
     and pr.employment_type = 'contractor'
   group by fa.profile_id, fa.department_id
  on conflict (org_id, user_id, week_start, department_id) do nothing;

  insert into public.deliverable_reviews
    (org_id, deliverable_id, actor_id, actor_label, from_stage, to_stage, decision, comment)
  values (v_org, d.id, v_actor, v_me.full_name, d.stage, d.stage, 'approve',
          coalesce(v_comment, 'Accepted for payment'));

  insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
  select v_org, fa.profile_id, 'deliverable_approved',
         'Accepted: ' || d.title,
         v_me.full_name || ' accepted this deliverable',
         'deliverable', d.id
    from public.deliverable_fee_allocations fa
   where fa.deliverable_id = d.id and fa.profile_id <> v_actor;

  return d;
end $$;

create or replace function public.unaccept_deliverable(p_deliverable_id uuid, p_comment text default null)
returns public.deliverables
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_org     uuid;
  v_me      record;
  d         public.deliverables;
  t         public.tasks;
  v_start   date;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  v_org := public.current_org_id();

  select user_id, full_name into v_me
    from public.profiles where user_id = v_actor and org_id = v_org and is_active;
  if not found then raise exception 'No profile for this user'; end if;

  select * into d from public.deliverables where id = p_deliverable_id and org_id = v_org;
  if not found then raise exception 'Deliverable not found'; end if;
  if d.accepted_at is null then raise exception 'This deliverable has not been accepted'; end if;

  select * into t from public.tasks where id = d.task_id and org_id = v_org;

  if not (public.is_admin_or_executive()
          or v_actor = any (public.timesheet_week_approvers(v_org, t.department_id))) then
    raise exception 'Only this workstream''s lead, or an admin, can un-accept a deliverable';
  end if;

  v_start := public.timesheet_week_start(d.accepted_at);

  if exists (
    select 1 from public.deliverable_fee_allocations fa
      join public.timesheet_weeks w
        on w.org_id = v_org and w.user_id = fa.profile_id
       and w.week_start = v_start
       and w.department_id is not distinct from fa.department_id
     where fa.deliverable_id = d.id
       and (w.paid_at is not null or w.status = 'approved'))
  then
    raise exception 'This fee has already cleared approval for payroll and can no longer be withdrawn';
  end if;

  update public.deliverables
     set accepted_at = null, accepted_by = null
   where id = d.id
  returning * into d;

  -- Clean up any week this acceptance opened that now has nothing in it. Left
  -- behind, it would sit in the lead's queue as an empty week forever.
  delete from public.timesheet_weeks w
   where w.org_id = v_org
     and w.week_start = v_start
     and w.status in ('draft', 'pending_lead')
     and w.paid_at is null
     and not exists (select 1 from public.v_time_entry_weeks e
                      where e.org_id = w.org_id and e.user_id = w.user_id
                        and e.week_start = w.week_start
                        and e.department_id is not distinct from w.department_id)
     and not exists (select 1 from public.v_deliverable_fee_weeks fw
                      where fw.org_id = w.org_id and fw.user_id = w.user_id
                        and fw.week_start = w.week_start
                        and fw.department_id is not distinct from w.department_id);

  insert into public.deliverable_reviews
    (org_id, deliverable_id, actor_id, actor_label, from_stage, to_stage, decision, comment)
  values (v_org, d.id, v_actor, v_me.full_name, d.stage, d.stage, 'reopen',
          coalesce(v_comment, 'Acceptance withdrawn'));

  insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
  select v_org, fa.profile_id, 'deliverable_review',
         'Reopened: ' || d.title,
         v_me.full_name || ' withdrew acceptance of this deliverable',
         'deliverable', d.id
    from public.deliverable_fee_allocations fa
   where fa.deliverable_id = d.id and fa.profile_id <> v_actor;

  return d;
end $$;

grant execute on function public.accept_deliverable(uuid, text) to authenticated;
grant execute on function public.unaccept_deliverable(uuid, text) to authenticated;
grant select on public.v_deliverable_fee_weeks to authenticated;
