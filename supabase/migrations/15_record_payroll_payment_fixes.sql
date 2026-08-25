-- Fix two gaps in record_payroll_payment:
-- 1. p_period_id/p_profile_id were never checked against the caller's org
--    (unlike mark_pay_period_paid's `where ... and org_id = current_org_id()`),
--    letting a cross-org UUID create a payment tagged under the wrong org.
-- 2. p_amount was trusted verbatim from the client with no server-side
--    check against actual billable hours; now computed from
--    time_entry_costs for that profile/period instead.
create or replace function public.record_payroll_payment(
  p_period_id uuid,
  p_profile_id uuid,
  p_amount numeric,
  p_notes text default null
) returns public.payroll_payments
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row public.payroll_payments;
  v_period public.pay_periods;
  v_amount numeric;
begin
  if not public.has_financial_access() then
    raise exception 'Not authorized to record a payroll payment';
  end if;

  select * into v_period from public.pay_periods
   where id = p_period_id and org_id = public.current_org_id();
  if not found then
    raise exception 'Pay period not found';
  end if;

  if not exists (
    select 1 from public.profiles where id = p_profile_id and org_id = public.current_org_id()
  ) then
    raise exception 'Profile not found';
  end if;

  select coalesce(sum(billable_amount), 0) into v_amount
    from public.time_entry_costs
   where user_id = p_profile_id
     and entry_date between v_period.period_start and v_period.period_end;

  insert into public.payroll_payments (org_id, pay_period_id, profile_id, amount, paid_by, notes)
  values (public.current_org_id(), p_period_id, p_profile_id, v_amount, (select auth.uid()), p_notes)
  returning * into v_row;

  return v_row;
end $$;
