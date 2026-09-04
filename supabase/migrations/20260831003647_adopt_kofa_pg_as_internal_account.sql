-- Data migration: adopt the existing "Kofa P/G" account as the internal one
-- and clear the fabricated budgets on its three projects.

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
