-- ============================================================================
-- Budget planning & workstreams: monthly project budgets, workstream
-- (department) allocation, MD approval, and per-task hour commitments that
-- draw down a workstream's monthly budget.
--
-- Terminology: "workstream" is the same underlying `departments` table/
-- column used everywhere else (profiles.department_id, tasks.department_id).
-- We are not renaming the table -- only how the product talks about it.
--
-- Applied to production via Supabase MCP apply_migration on 2026-08-27;
-- this file mirrors that migration for repo history / `supabase db pull`
-- parity. See docs/ or project memory for the full design rationale.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Drop everything that still depends on projects.department_id, so the
--    column can go. v_department_load pivots from "the project's one
--    department" (a concept that's going away) to "tasks routed to this
--    workstream" (tasks.department_id already exists for exactly this).
-- ----------------------------------------------------------------------------

drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop view if exists public.v_project_budget;
drop view if exists public.v_department_load;

-- ----------------------------------------------------------------------------
-- 1. projects: drop department/lead/due_date/budget_hours, add length_months
-- ----------------------------------------------------------------------------

alter table public.projects add column length_months integer;

update public.projects p
set length_months = greatest(
  1,
  case
    when p.due_date is null or p.due_date < current_date then 1
    else (
      (date_part('year', age(date_trunc('month', p.due_date), date_trunc('month', current_date))) * 12
       + date_part('month', age(date_trunc('month', p.due_date), date_trunc('month', current_date))))::int + 1
    )
  end
);

alter table public.projects
  alter column length_months set default 1,
  alter column length_months set not null,
  add constraint projects_length_months_check check (length_months > 0);

create table public.project_monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  month date not null,
  amount numeric not null default 0 check (amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, month),
  check (date_trunc('month', month) = month)
);

insert into public.project_monthly_budgets (org_id, project_id, month, amount, status)
select
  p.org_id,
  p.id,
  gs.month,
  case
    when gs.month = (date_trunc('month', current_date)::date + ((p.length_months - 1) || ' months')::interval)::date
      then p.budget_amount - round(p.budget_amount / p.length_months, 2) * (p.length_months - 1)
    else round(p.budget_amount / p.length_months, 2)
  end,
  'draft'
from public.projects p
cross join lateral generate_series(
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date)::date + ((p.length_months - 1) || ' months')::interval)::date,
  interval '1 month'
) as gs(month);

create trigger project_monthly_budgets_touch
  before update on public.project_monthly_budgets
  for each row execute function public.touch_updated_at();

alter table public.projects
  drop column department_id,
  drop column lead_id,
  drop column due_date,
  drop column budget_hours;

create policy projects_insert on public.projects
  for insert
  with check (org_id = current_org_id() and is_admin_or_executive());

create policy projects_update on public.projects
  for update
  using (org_id = current_org_id() and is_admin_or_executive())
  with check (org_id = current_org_id());

-- ----------------------------------------------------------------------------
-- 2. workstream_budgets: MD's monthly allocation of an approved monthly
--    budget across workstreams (departments)
-- ----------------------------------------------------------------------------

create table public.workstream_budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  month date not null,
  department_id uuid not null references public.departments(id),
  amount numeric not null default 0 check (amount >= 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, month, department_id),
  foreign key (project_id, month) references public.project_monthly_budgets(project_id, month) on delete cascade
);

create trigger workstream_budgets_touch
  before update on public.workstream_budgets
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. workstream_budget_requests: a workstream leader asking the MD for more
--    budget when planned hours would overrun the month's allocation
-- ----------------------------------------------------------------------------

create table public.workstream_budget_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  month date not null,
  department_id uuid not null references public.departments(id),
  requested_by uuid not null references public.profiles(id),
  requested_amount numeric not null check (requested_amount > 0),
  reason text,
  status public.task_time_request_status not null default 'pending',
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. task_hour_allocations: hours a workstream leader commits to a
--    contractor on a task, for a specific budget month. Separate from
--    task_assignees (pure membership) so a task can carry hours across
--    multiple months without disturbing who's on it.
-- ----------------------------------------------------------------------------

create table public.task_hour_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  task_id uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  department_id uuid not null references public.departments(id),
  budget_month date not null,
  hours numeric not null check (hours > 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, profile_id, budget_month),
  check (date_trunc('month', budget_month) = budget_month)
);

create trigger task_hour_allocations_touch
  before update on public.task_hour_allocations
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------

alter table public.project_monthly_budgets enable row level security;
alter table public.workstream_budgets enable row level security;
alter table public.workstream_budget_requests enable row level security;
alter table public.task_hour_allocations enable row level security;

create policy pmb_read on public.project_monthly_budgets
  for select using (org_id = current_org_id() and has_financial_access());

create policy wb_read on public.workstream_budgets
  for select using (org_id = current_org_id() and has_financial_access());

create policy wbr_read on public.workstream_budget_requests
  for select using (org_id = current_org_id() and (requested_by = (select auth.uid()) or is_lead_or_admin()));

create policy wbr_insert on public.workstream_budget_requests
  for insert
  with check (
    org_id = current_org_id()
    and requested_by = (select auth.uid())
    and (is_admin_or_executive() or (current_user_role() = 'dept_lead' and department_id = current_department_id()))
  );

create policy tha_read on public.task_hour_allocations
  for select using (org_id = current_org_id());

create policy tha_write on public.task_hour_allocations
  for insert
  with check (org_id = current_org_id() and is_lead_or_admin());

create policy tha_update on public.task_hour_allocations
  for update
  using (org_id = current_org_id() and is_lead_or_admin())
  with check (org_id = current_org_id());

create policy tha_delete on public.task_hour_allocations
  for delete
  using (org_id = current_org_id() and is_lead_or_admin());

-- ----------------------------------------------------------------------------
-- 6. Views
-- ----------------------------------------------------------------------------

create view public.v_project_monthly_budget with (security_invoker = on) as
select
  pmb.*,
  coalesce(w.allocated_total, 0) as allocated_to_workstreams,
  pmb.amount - coalesce(w.allocated_total, 0) as unallocated_amount
from public.project_monthly_budgets pmb
left join lateral (
  select sum(wb.amount) as allocated_total
  from public.workstream_budgets wb
  where wb.project_id = pmb.project_id and wb.month = pmb.month
) w on true;

create view public.v_workstream_budget with (security_invoker = on) as
select
  wb.id,
  wb.org_id,
  wb.project_id,
  wb.month,
  wb.department_id,
  d.name as department_name,
  wb.amount as allocated_amount,
  coalesce(c.committed_amount, 0) as committed_amount,
  wb.amount - coalesce(c.committed_amount, 0) as remaining_amount
from public.workstream_budgets wb
join public.departments d on d.id = wb.department_id
left join lateral (
  select sum(tha.hours * coalesce(pr.bill_rate, 0)) as committed_amount
  from public.task_hour_allocations tha
  join public.tasks t on t.id = tha.task_id
  left join public.profile_rates pr on pr.profile_id = tha.profile_id
  where t.project_id = wb.project_id
    and tha.department_id = wb.department_id
    and tha.budget_month = wb.month
) c on true;

create view public.v_project_budget with (security_invoker = on) as
select
  p.id as project_id,
  p.org_id,
  p.account_id,
  a.name as account_name,
  p.name,
  p.code,
  p.status,
  p.start_date,
  p.length_months,
  case when p.start_date is not null
    then (p.start_date + (p.length_months || ' months')::interval)::date
    else null
  end as target_end_date,
  p.budget_amount,
  coalesce(h.total_hours, 0) as total_hours,
  coalesce(h.billable_hours, 0) as billable_hours,
  c.accrued_amount,
  c.accrued_cost,
  case
    when c.accrued_amount is not null and p.budget_amount > 0
      then round(c.accrued_amount / p.budget_amount * 100, 1)
    else null
  end as pct_amount,
  case
    when c.accrued_amount is not null then round(p.budget_amount - c.accrued_amount, 2)
    else null
  end as remaining_amount,
  case
    when c.accrued_amount is not null and c.accrued_cost is not null and c.accrued_amount > 0
      then round((c.accrued_amount - c.accrued_cost) / c.accrued_amount * 100, 1)
    else null
  end as margin_pct,
  case
    when c.accrued_amount is not null and p.start_date is not null and p.length_months > 0
      then round(
        c.accrued_amount / least(1.0, greatest(0.05,
          (current_date - p.start_date)::numeric
          / (p.length_months * 30.44)
        )),
        2
      )
    else null
  end as projected_amount
from public.projects p
join public.accounts a on a.id = p.account_id
left join lateral (
  select round(sum(t.duration_minutes)::numeric / 60.0, 2) as total_hours,
    round(sum(case when t.is_billable then t.duration_minutes else 0 end)::numeric / 60.0, 2) as billable_hours
  from public.time_entries t
  where t.project_id = p.id and t.ended_at is not null
) h on true
left join lateral (
  select sum(tc.billable_amount) as accrued_amount, sum(tc.cost_amount) as accrued_cost
  from public.time_entry_costs tc
  where tc.project_id = p.id
) c on true;

create view public.v_department_load with (security_invoker = on) as
select
  d.id as department_id,
  d.org_id,
  d.name,
  d.color,
  (select count(distinct t.project_id)
     from public.tasks t join public.projects p on p.id = t.project_id
    where t.department_id = d.id and p.status = 'active') as active_projects,
  (select count(*) from public.tasks t
    where t.department_id = d.id and t.status <> 'done') as open_tasks,
  (select count(*) from public.tasks t
    where t.department_id = d.id and t.status <> 'done' and t.due_date < current_date) as overdue_tasks,
  (select coalesce(round(sum(te.duration_minutes)::numeric / 60.0, 1), 0)
     from public.time_entries te join public.tasks t on t.id = te.task_id
    where t.department_id = d.id and te.ended_at is not null and te.started_at >= date_trunc('week', now())) as hours_this_week,
  (select count(*) from public.deliverables dl join public.tasks t on t.id = dl.task_id
    where t.department_id = d.id and dl.stage in ('internal_review', 'client_review')) as deliverables_in_review
from public.departments d;

-- ----------------------------------------------------------------------------
-- 7. Functions
-- ----------------------------------------------------------------------------

create or replace function public.check_project_budget(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_project   record;
  v_accrued   numeric := 0;
  v_pct       numeric := 0;
  v_threshold integer;
begin
  select p.id, p.org_id, p.name, p.budget_amount
    into v_project
  from public.projects p where p.id = p_project_id;

  if not found then return; end if;
  if v_project.budget_amount <= 0 then return; end if;

  select coalesce(sum(c.billable_amount), 0) into v_accrued
  from public.time_entry_costs c where c.project_id = p_project_id;

  v_pct := (v_accrued / v_project.budget_amount) * 100;

  foreach v_threshold in array array[75, 90, 100] loop
    if v_pct >= v_threshold then
      begin
        insert into public.project_budget_alerts (project_id, threshold)
        values (p_project_id, v_threshold);
      exception when unique_violation then
        continue;
      end;

      insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
      select
        v_project.org_id,
        pr.id,
        'budget_threshold',
        v_project.name || ' is at ' || v_threshold || '% of budget',
        round(v_pct, 1) || '% consumed. ' ||
          case when v_threshold >= 100 then 'This project is over budget.'
               else 'Review scope before it runs out.' end,
        'project',
        p_project_id
      from public.profiles pr
      where pr.org_id = v_project.org_id
        and pr.is_active
        and pr.role in ('admin', 'executive');
    end if;
  end loop;
end $function$;

create or replace function public.get_account_portal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_link    record;
  v_account record;
  v_result  jsonb;
begin
  select l.id, l.account_id, l.org_id into v_link
  from public.account_share_links l
  where l.token = p_token
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now());

  if not found then
    raise exception 'This link is no longer valid' using errcode = 'no_data_found';
  end if;

  update public.account_share_links set last_viewed_at = now() where id = v_link.id;

  select a.id, a.name, a.primary_contact_name, a.status
    into v_account
  from public.accounts a where a.id = v_link.account_id;

  select jsonb_build_object(
    'account', jsonb_build_object(
      'name', v_account.name,
      'contact_name', v_account.primary_contact_name,
      'status', v_account.status
    ),
    'projects', coalesce((
      select jsonb_agg(x order by x->>'name')
      from (
        select jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'status', p.status,
          'consumed_pct', (
            select case when p.budget_amount > 0
              then round((coalesce(sum(tc.billable_amount), 0) / p.budget_amount) * 100, 0)
              else null end
            from public.time_entry_costs tc where tc.project_id = p.id
          ),
          'open_tasks', (select count(*) from public.tasks t
                         where t.project_id = p.id and t.status <> 'done')
        ) as x
        from public.projects p
        where p.account_id = v_link.account_id and p.status <> 'archived'
      ) s
    ), '[]'::jsonb),
    'awaiting_approval', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', dl.id,
        'title', dl.title,
        'description', dl.description,
        'project_name', p.name,
        'due_date', dl.due_date,
        'version', dl.version
      ) order by dl.due_date nulls last)
      from public.deliverables dl
      join public.projects p on p.id = dl.project_id
      where p.account_id = v_link.account_id and dl.stage = 'client_review'
    ), '[]'::jsonb),
    'recently_approved', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', dl.title,
        'project_name', p.name,
        'approved_at', dl.approved_at
      ) order by dl.approved_at desc)
      from public.deliverables dl
      join public.projects p on p.id = dl.project_id
      where p.account_id = v_link.account_id and dl.stage = 'approved'
      limit 5
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $function$;

create or replace function public.set_project_monthly_budgets(p_project_id uuid, p_entries jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_budget numeric;
  v_locked_total numeric := 0;
  v_new_total numeric := 0;
  v_entry jsonb;
  v_month date;
begin
  if not public.is_admin_or_executive() then
    raise exception 'Not authorized';
  end if;

  select org_id, budget_amount into v_org, v_budget
  from public.projects where id = p_project_id and org_id = public.current_org_id();
  if not found then raise exception 'Project not found'; end if;

  select coalesce(sum(amount), 0) into v_locked_total
  from public.project_monthly_budgets
  where project_id = p_project_id and status = 'approved';

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_month := date_trunc('month', (v_entry->>'month')::date)::date;
    if exists (
      select 1 from public.project_monthly_budgets
      where project_id = p_project_id and month = v_month and status = 'approved'
    ) then
      raise exception 'Month % is already approved -- unapprove it before editing.', v_month;
    end if;
    v_new_total := v_new_total + (v_entry->>'amount')::numeric;
  end loop;

  if round(v_locked_total + v_new_total, 2) <> round(v_budget, 2) then
    raise exception 'Monthly budgets (%) must add up to the project budget (%)', round(v_locked_total + v_new_total, 2), round(v_budget, 2);
  end if;

  delete from public.project_monthly_budgets
  where project_id = p_project_id and status = 'draft';

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    insert into public.project_monthly_budgets (org_id, project_id, month, amount, status)
    values (v_org, p_project_id, date_trunc('month', (v_entry->>'month')::date)::date, (v_entry->>'amount')::numeric, 'draft');
  end loop;
end $function$;

create or replace function public.approve_project_monthly_budget(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_admin_or_executive() then
    raise exception 'Not authorized';
  end if;
  update public.project_monthly_budgets
  set status = 'approved', approved_by = (select auth.uid()), approved_at = now()
  where id = p_id and org_id = public.current_org_id();
  if not found then raise exception 'Monthly budget not found'; end if;
end $function$;

create or replace function public.unapprove_project_monthly_budget(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_admin_or_executive() then
    raise exception 'Not authorized';
  end if;
  update public.project_monthly_budgets
  set status = 'draft', approved_by = null, approved_at = null
  where id = p_id and org_id = public.current_org_id();
  if not found then raise exception 'Monthly budget not found'; end if;
end $function$;

create or replace function public.set_workstream_budgets(p_project_id uuid, p_month date, p_entries jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_month_budget numeric;
  v_new_total numeric := 0;
  v_entry jsonb;
  v_month date := date_trunc('month', p_month)::date;
begin
  if not public.is_admin_or_executive() then
    raise exception 'Not authorized';
  end if;

  select org_id into v_org from public.projects where id = p_project_id and org_id = public.current_org_id();
  if not found then raise exception 'Project not found'; end if;

  select amount into v_month_budget
  from public.project_monthly_budgets
  where project_id = p_project_id and month = v_month;
  if not found then raise exception 'No monthly budget set for %', v_month; end if;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_new_total := v_new_total + (v_entry->>'amount')::numeric;
  end loop;

  if v_new_total > v_month_budget then
    raise exception 'Workstream allocations (%) exceed the monthly budget (%)', v_new_total, v_month_budget;
  end if;

  delete from public.workstream_budgets where project_id = p_project_id and month = v_month;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    insert into public.workstream_budgets (org_id, project_id, month, department_id, amount, created_by)
    values (v_org, p_project_id, v_month, (v_entry->>'department_id')::uuid, (v_entry->>'amount')::numeric, (select auth.uid()));
  end loop;
end $function$;

create or replace function public.request_workstream_budget(
  p_project_id uuid, p_month date, p_department_id uuid, p_requested_amount numeric, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_me record;
  v_id uuid;
begin
  select id, org_id, role, full_name, department_id into v_me from public.profiles where id = (select auth.uid());
  if not found then raise exception 'No profile for this user'; end if;

  if not (public.is_admin_or_executive() or (v_me.role = 'dept_lead' and v_me.department_id = p_department_id)) then
    raise exception 'Not authorized to request budget for this workstream';
  end if;

  select org_id into v_org from public.projects where id = p_project_id and org_id = v_me.org_id;
  if not found then raise exception 'Project not found'; end if;

  insert into public.workstream_budget_requests (org_id, project_id, month, department_id, requested_by, requested_amount, reason)
  values (v_org, p_project_id, date_trunc('month', p_month)::date, p_department_id, v_me.id, p_requested_amount, p_reason)
  returning id into v_id;

  insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
  select v_org, pr.id, 'budget_threshold',
    v_me.full_name || ' requested more workstream budget',
    (select name from public.departments where id = p_department_id) || ' needs ' || p_requested_amount || ' more for ' || to_char(p_month, 'Mon YYYY'),
    'workstream_budget_request', v_id
  from public.profiles pr
  where pr.org_id = v_org and pr.is_active and pr.role in ('admin', 'executive');

  return v_id;
end $function$;

create or replace function public.decide_workstream_budget_request(p_request_id uuid, p_decision text, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me record;
  r record;
  v_status public.task_time_request_status;
begin
  select id, org_id, full_name into v_me from public.profiles where id = (select auth.uid());
  if not found then raise exception 'No profile for this user'; end if;

  if not public.is_admin_or_executive() then
    raise exception 'Not authorized to decide this request';
  end if;

  select * into r from public.workstream_budget_requests where id = p_request_id and org_id = v_me.org_id;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been decided'; end if;
  if r.requested_by = v_me.id then raise exception 'You cannot decide your own request'; end if;

  v_status := case lower(p_decision)
    when 'approve' then 'approved'::public.task_time_request_status
    when 'deny' then 'denied'::public.task_time_request_status
    else null
  end;
  if v_status is null then raise exception 'Unknown decision: %', p_decision; end if;

  update public.workstream_budget_requests
  set status = v_status, decided_by = v_me.id, decided_at = now()
  where id = p_request_id;

  if v_status = 'approved' then
    insert into public.workstream_budgets (org_id, project_id, month, department_id, amount, created_by)
    values (r.org_id, r.project_id, r.month, r.department_id, r.requested_amount, v_me.id)
    on conflict (project_id, month, department_id)
    do update set amount = public.workstream_budgets.amount + excluded.amount;
  end if;

  insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
  values (
    v_me.org_id, r.requested_by, 'budget_threshold',
    (case when v_status = 'approved' then 'Approved: ' else 'Denied: ' end) || r.requested_amount || ' budget request',
    coalesce(p_comment, 'Decided by ' || v_me.full_name),
    'workstream_budget_request', p_request_id
  );

  return jsonb_build_object('request_id', p_request_id, 'status', v_status);
end $function$;

grant execute on function public.set_project_monthly_budgets(uuid, jsonb) to authenticated;
grant execute on function public.approve_project_monthly_budget(uuid) to authenticated;
grant execute on function public.unapprove_project_monthly_budget(uuid) to authenticated;
grant execute on function public.set_workstream_budgets(uuid, date, jsonb) to authenticated;
grant execute on function public.request_workstream_budget(uuid, date, uuid, numeric, text) to authenticated;
grant execute on function public.decide_workstream_budget_request(uuid, text, text) to authenticated;
