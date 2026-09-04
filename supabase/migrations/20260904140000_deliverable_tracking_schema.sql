-- Deliverable-based tracking for tasks, alongside the existing time-based
-- tracking. A task is either time-tracked (hours x cost_rate, the old path)
-- or deliverable-tracked (a fixed fee per deliverable, split across the
-- people who earn it, paid when the workstream lead accepts the deliverable).
--
-- The unit of money is deliverable_fee_allocations: one row per person per
-- deliverable per budget month, deliberately the same shape as
-- task_hour_allocations so it commits against the same workstream budget and
-- flows through the same lead -> managing director -> finance approval chain.

-- ---------------------------------------------------------------- task mode
do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_tracking_mode') then
    create type public.task_tracking_mode as enum ('time', 'deliverable');
  end if;
end $$;

alter table public.tasks
  add column if not exists tracking_mode public.task_tracking_mode not null default 'time';

comment on column public.tasks.tracking_mode is
  'time = paid by logged hours x cost_rate (task_hour_allocations). deliverable = paid a fixed fee per accepted deliverable (deliverable_fee_allocations); time logged on such a task still counts for utilisation but earns no cost.';

-- ------------------------------------------------------------- acceptance
alter table public.deliverables
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references public.app_users(id) on delete set null;

comment on column public.deliverables.accepted_at is
  'Set by accept_deliverable() when a workstream lead accepts the work. This — not the client-facing stage board — is what makes its fee allocations earned and payable.';

-- -------------------------------------------------------- fee allocations
create table if not exists public.deliverable_fee_allocations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  deliverable_id uuid not null,
  profile_id     uuid not null references public.app_users(id),
  department_id  uuid not null,
  budget_month   date not null,
  amount         numeric not null,
  created_by     uuid references public.app_users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint deliverable_fee_allocations_amount_check check (amount > 0),
  constraint deliverable_fee_allocations_budget_month_check
    check (date_trunc('month', budget_month::timestamptz) = budget_month),
  constraint deliverable_fee_allocations_deliverable_id_fkey
    foreign key (deliverable_id, org_id) references public.deliverables(id, org_id) on delete cascade,
  constraint deliverable_fee_allocations_department_id_fkey
    foreign key (department_id, org_id) references public.departments(id, org_id),
  constraint deliverable_fee_allocations_unique
    unique (deliverable_id, profile_id, budget_month)
);

comment on table public.deliverable_fee_allocations is
  'A fixed fee committed to one person for one deliverable, in one budget month. Mirrors task_hour_allocations: it draws on the workstream budget the moment it is allocated, and becomes payable once the deliverable is accepted.';

create index if not exists deliverable_fee_allocations_deliverable_idx
  on public.deliverable_fee_allocations (deliverable_id);
create index if not exists deliverable_fee_allocations_profile_month_idx
  on public.deliverable_fee_allocations (org_id, profile_id, budget_month);

drop trigger if exists deliverable_fee_allocations_touch on public.deliverable_fee_allocations;
create trigger deliverable_fee_allocations_touch
  before update on public.deliverable_fee_allocations
  for each row execute function public.touch_updated_at();

alter table public.deliverable_fee_allocations enable row level security;

-- Read is NARROWER than task_hour_allocations on purpose. An hour allocation
-- only leaks hours (turning them into money needs profile_rates, which is
-- money-gated); a fee allocation IS the money, so a colleague's fee is not
-- org-wide readable. Leads/admins and finance see everything; everyone else
-- sees only their own.
drop policy if exists dfa_read on public.deliverable_fee_allocations;
create policy dfa_read on public.deliverable_fee_allocations for select
  using (
    org_id = public.current_org_id()
    and (
      public.is_lead_or_admin()
      or public.has_financial_access()
      or profile_id = (select auth.uid())
    )
  );

drop policy if exists dfa_write on public.deliverable_fee_allocations;
create policy dfa_write on public.deliverable_fee_allocations for insert
  with check (org_id = public.current_org_id() and public.is_lead_or_admin());

drop policy if exists dfa_update on public.deliverable_fee_allocations;
create policy dfa_update on public.deliverable_fee_allocations for update
  using (org_id = public.current_org_id() and public.is_lead_or_admin())
  with check (org_id = public.current_org_id());

drop policy if exists dfa_delete on public.deliverable_fee_allocations;
create policy dfa_delete on public.deliverable_fee_allocations for delete
  using (org_id = public.current_org_id() and public.is_lead_or_admin());

-- A fee that has already cleared approval or been paid must not be edited
-- out from under payroll. Acceptance is the line: once the deliverable is
-- accepted, only an un-accept (which has its own guard) can reopen it.
create or replace function public.deliverable_fee_allocation_guard()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_deliverable uuid;
  v_accepted    timestamptz;
begin
  v_deliverable := case when tg_op = 'DELETE' then old.deliverable_id else new.deliverable_id end;

  -- No parent row means the deliverable itself (or its project/workspace) is
  -- being deleted and this is the cascade, not a hand edit. Let it through --
  -- blocking it would break deleting a project or resetting a workspace, the
  -- same way the first cut of the timesheet lock did.
  select d.accepted_at into v_accepted
    from public.deliverables d
   where d.id = v_deliverable;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_accepted is not null then
    raise exception 'This deliverable has been accepted -- un-accept it before changing who is paid for it'
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists deliverable_fee_allocations_guard on public.deliverable_fee_allocations;
create trigger deliverable_fee_allocations_guard
  before insert or update or delete on public.deliverable_fee_allocations
  for each row execute function public.deliverable_fee_allocation_guard();
