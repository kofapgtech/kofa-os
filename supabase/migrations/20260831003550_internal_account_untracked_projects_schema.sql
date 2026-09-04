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

-- 7 ------------------------------------- the internal account cannot be deleted

drop policy if exists accounts_delete on public.accounts;
create policy accounts_delete on public.accounts
  for delete
  using (
    org_id = public.current_org_id()
    and public.is_admin_or_executive()
    and not is_internal
  );
