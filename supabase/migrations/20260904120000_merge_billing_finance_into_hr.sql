-- Billing/Finance and HR become one role: HR (hr_manager).
-- Everyone who was billing_finance keeps every permission they had, because
-- has_financial_access() now answers yes for hr_manager too.

update public.profiles
set role = 'hr_manager'
where role = 'billing_finance';

create or replace function public.has_financial_access()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and org_id = public.current_org_id()
      and role in ('admin','dept_lead','executive','hr_manager') and is_active
  )
$function$;

-- The enum label stays in public.user_role (Postgres cannot drop an enum
-- value), so a constraint is what actually retires it.
alter table public.profiles
  drop constraint if exists profiles_role_not_billing_finance;

alter table public.profiles
  add constraint profiles_role_not_billing_finance
  check (role <> 'billing_finance'::public.user_role);
