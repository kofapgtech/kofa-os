-- ============================================================================
-- The internal workspace
--
-- Every workspace gets exactly one protected "internal" account for its own
-- work. Projects on that account -- and only on that account -- may run with
-- no budget (budget_amount is null) and no end date (length_months is null).
--
-- NULL is the signal, not a separate flag: 0 still means "a tracked budget
-- that happens to be zero". v_project_budget already degrades correctly for
-- NULL on every derived column, so no view changes are needed.
--
-- PRD: docs/PRD-Workspaces.md section 3
-- ============================================================================

-- 1 -------------------------------------------------------- the internal flag

alter table public.accounts
  add column if not exists is_internal boolean not null default false;

comment on column public.accounts.is_internal is
  'Marks the workspace''s own account, for internal work rather than a client''s. '
  'Exactly one per org (accounts_one_internal_per_org). Cannot be deleted, cannot '
  'be flipped after insert, and cannot be issued a client portal link. Only its '
  'projects may have a null budget_amount or length_months.';

create unique index if not exists accounts_one_internal_per_org
  on public.accounts (org_id) where is_internal;

-- 2 ------------------------------------------------- adopt Kofa P/G as internal
-- Runs before the immutability trigger below, which is what blocks this UPDATE
-- from ever happening again.

do $$
declare v_acct uuid;
begin
  select id into v_acct from public.accounts where name = 'Kofa P/G' limit 1;
  if v_acct is not null then
    update public.accounts set is_internal = true where id = v_acct;
  end if;
end $$;

-- 3 -------------------------------------------- budget and length become optional
-- Defaults are dropped along with NOT NULL so that an insert which forgets the
-- field fails loudly against the trigger below, rather than silently recording
-- a tracked budget of 0 / a length of 1 month.

alter table public.projects alter column budget_amount  drop not null;
alter table public.projects alter column budget_amount  drop default;
alter table public.projects alter column length_months  drop not null;
alter table public.projects alter column length_months  drop default;

comment on column public.projects.budget_amount is
  'Null means no budget is tracked -- only allowed on the internal account. '
  'Zero still means a tracked budget of zero.';
comment on column public.projects.length_months is
  'Null means open-ended -- only allowed on the internal account.';

-- 4 ----------------------------- untracked projects live only on the internal account
-- A CHECK constraint cannot reach across to accounts, so this is a trigger.
-- It fires on UPDATE too, which is what stops an untracked project being moved
-- onto a client account after the fact.

create or replace function public.projects_untracked_requires_internal()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (new.budget_amount is null or new.length_months is null)
     and not exists (
       select 1 from public.accounts a
       where a.id = new.account_id and a.is_internal
     )
  then
    raise exception
      'Only projects on the internal account can run without a budget or an end date'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists projects_untracked_requires_internal on public.projects;
create trigger projects_untracked_requires_internal
  before insert or update of account_id, budget_amount, length_months
  on public.projects
  for each row execute function public.projects_untracked_requires_internal();

-- 5 --------------------------------- clear the fabricated numbers on internal work
-- Kofa OS, Kofa Website and FY26 Media Planning each carried an invented budget
-- and month count. Removing: 17 project_monthly_budgets rows (4 of them approved,
-- all on Kofa OS), 3 workstream_budgets rows, and 2 stale project_budget_alerts.
-- Tasks, time entries and the one existing hour allocation are untouched.

do $$
declare v_acct uuid;
begin
  select id into v_acct from public.accounts where is_internal limit 1;
  if v_acct is null then return; end if;

  delete from public.workstream_budget_requests
   where project_id in (select id from public.projects where account_id = v_acct);

  delete from public.workstream_budgets
   where project_id in (select id from public.projects where account_id = v_acct);

  delete from public.project_monthly_budgets
   where project_id in (select id from public.projects where account_id = v_acct);

  delete from public.project_budget_alerts
   where project_id in (select id from public.projects where account_id = v_acct);

  update public.projects
     set budget_amount    = null,
         length_months    = null,
         default_billable = false
   where account_id = v_acct;
end $$;

-- 6 ------------------------------------------- the internal flag is immutable
-- Set once at insert (create_workspace will do this for new workspaces), never
-- changed afterwards. Stops both demoting the internal account and promoting a
-- second one.

create or replace function public.accounts_guard_internal()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.is_internal is distinct from old.is_internal then
    raise exception 'An account cannot be switched into or out of being the internal account'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists accounts_guard_internal on public.accounts;
create trigger accounts_guard_internal
  before update of is_internal on public.accounts
  for each row execute function public.accounts_guard_internal();

-- 7 ------------------------------------- the internal account cannot be deleted

drop policy if exists accounts_delete on public.accounts;
create policy accounts_delete on public.accounts
  for delete
  using (
    org_id = public.current_org_id()
    and public.is_admin_or_executive()
    and not is_internal
  );

-- 8 ------------------------------- no client portal link for the internal account

create or replace function public.create_account_share_link(
  p_account_id uuid, p_days integer default 30, p_label text default null
)
returns account_share_links
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.account_share_links;
  v_org uuid;
  v_internal boolean;
begin
  if not public.is_admin_or_executive() then
    raise exception 'Only an admin or executive can issue a client link';
  end if;

  select org_id, is_internal into v_org, v_internal
  from public.accounts where id = p_account_id;
  if v_org is null or v_org <> public.current_org_id() then
    raise exception 'Account not found';
  end if;

  if v_internal then
    raise exception 'The internal account has no client to share it with';
  end if;

  insert into public.account_share_links (org_id, account_id, token, label, expires_at, created_by)
  values (v_org, p_account_id, encode(extensions.gen_random_bytes(24), 'hex'), p_label,
          case when p_days is null then null else now() + make_interval(days => p_days) end,
          (select auth.uid()))
  returning * into v_row;

  return v_row;
end $function$;

-- 9 --------------------------- no budget-threshold alerts without a budget
-- The old guard was `if budget_amount <= 0 then return`. With NULL that is NULL,
-- so the early return never fired and the function went on to divide by NULL.
-- It happened to stay safe (NULL >= 75 is never true) but only by accident.

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
  if v_project.budget_amount is null or v_project.budget_amount <= 0 then return; end if;

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

-- 10 ------------------------ no monthly split, and no budget requests, without a budget
-- set_project_monthly_budgets compared the entries' total against budget_amount
-- with `<>`; against NULL that is NULL, so the guard silently passed and monthly
-- rows could be written to a project that has no budget at all.

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
  v_past_draft_total numeric := 0;
  v_new_total numeric := 0;
  v_entry jsonb;
  v_month date;
  v_cutoff date := date_trunc('month', current_date)::date;
begin
  if not public.is_admin_or_executive() then
    raise exception 'Not authorized';
  end if;

  select org_id, budget_amount into v_org, v_budget
  from public.projects where id = p_project_id and org_id = public.current_org_id();
  if not found then raise exception 'Project not found'; end if;

  if v_budget is null then
    raise exception 'This project has no budget to split across months.';
  end if;

  select coalesce(sum(amount), 0) into v_locked_total
  from public.project_monthly_budgets
  where project_id = p_project_id and status = 'approved';

  select coalesce(sum(amount), 0) into v_past_draft_total
  from public.project_monthly_budgets
  where project_id = p_project_id and status = 'draft' and month < v_cutoff;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_month := date_trunc('month', (v_entry->>'month')::date)::date;
    if v_month < v_cutoff then
      raise exception 'Cannot modify the budget for a past month (%).', v_month;
    end if;
    if exists (
      select 1 from public.project_monthly_budgets
      where project_id = p_project_id and month = v_month and status = 'approved'
    ) then
      raise exception 'Month % is already approved - unapprove it before editing.', v_month;
    end if;
    v_new_total := v_new_total + (v_entry->>'amount')::numeric;
  end loop;

  if round(v_locked_total + v_past_draft_total + v_new_total, 2) <> round(v_budget, 2) then
    raise exception 'Monthly budgets (%) must add up to the project budget (%)',
      round(v_locked_total + v_past_draft_total + v_new_total, 2), round(v_budget, 2);
  end if;

  delete from public.project_monthly_budgets
  where project_id = p_project_id and status = 'draft' and month >= v_cutoff;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    insert into public.project_monthly_budgets (org_id, project_id, month, amount, status)
    values (v_org, p_project_id, date_trunc('month', (v_entry->>'month')::date)::date,
            (v_entry->>'amount')::numeric, 'draft');
  end loop;
end $function$;

create or replace function public.request_workstream_budget(
  p_project_id uuid, p_month date, p_department_id uuid,
  p_requested_amount numeric, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_budget numeric;
  v_me record;
  v_id uuid;
  v_month date := date_trunc('month', p_month)::date;
begin
  select id, org_id, role, full_name, department_id into v_me
  from public.profiles where id = (select auth.uid());
  if not found then raise exception 'No profile for this user'; end if;

  if not (public.is_admin_or_executive()
          or (v_me.role = 'dept_lead' and v_me.department_id = p_department_id)) then
    raise exception 'Not authorized to request budget for this workstream';
  end if;

  if v_month < date_trunc('month', current_date)::date then
    raise exception 'Cannot request additional budget for a past month.';
  end if;

  select org_id, budget_amount into v_org, v_budget
  from public.projects where id = p_project_id and org_id = v_me.org_id;
  if not found then raise exception 'Project not found'; end if;

  if v_budget is null then
    raise exception 'This project has no budget, so there is no room to request.';
  end if;

  insert into public.workstream_budget_requests
    (org_id, project_id, month, department_id, requested_by, requested_amount, reason)
  values (v_org, p_project_id, v_month, p_department_id, v_me.id, p_requested_amount, p_reason)
  returning id into v_id;

  insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
  select v_org, pr.id, 'budget_threshold',
    v_me.full_name || ' requested more workstream budget',
    (select name from public.departments where id = p_department_id)
      || ' needs ' || p_requested_amount || ' more for ' || to_char(p_month, 'Mon YYYY'),
    'workstream_budget_request', v_id
  from public.profiles pr
  where pr.org_id = v_org and pr.is_active and pr.role in ('admin', 'executive');

  return v_id;
end $function$;
