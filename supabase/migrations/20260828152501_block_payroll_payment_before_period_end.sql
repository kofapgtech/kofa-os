-- A payment was recordable (and, on 2026-08-25, actually was recorded --
-- see payroll_payments id 947e3649-95a6-4dba-8ac5-1e62d6ac718a) for a pay
-- period that hadn't ended yet, mid-period, with hours still coming in
-- after the fact. record_payroll_payment() had no check on period_end at
-- all. This is the actual enforcement point -- the client-side "Pay now"
-- button in PayrollInvoiceModal.tsx now hides itself for an unended period
-- too, but that's just UX; nothing stops this RPC from being called
-- directly, so the guard belongs here.
--
-- `pay_periods.status` looks like it should carry this (an 'open'/'locked'/
-- 'paid' enum, with a mark_pay_period_paid() RPC already sitting unused),
-- but every period in this org is status='open' regardless of whether it
-- has ended -- nothing ever transitions it. Wiring that up is a separate,
-- bigger change; this guard uses the one signal that's actually reliable
-- today: period_end vs current_date.

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

  if v_period.period_end >= current_date then
    raise exception 'Cannot record a payment for a pay period that has not ended yet (ends %)', v_period.period_end;
  end if;

  if not exists (
    select 1 from public.profiles where id = p_profile_id and org_id = public.current_org_id()
  ) then
    raise exception 'Profile not found';
  end if;

  select coalesce(sum(cost_amount), 0) into v_amount
    from public.time_entry_costs
   where user_id = p_profile_id
     and entry_date between v_period.period_start and v_period.period_end;

  insert into public.payroll_payments (org_id, pay_period_id, profile_id, amount, paid_by, notes)
  values (public.current_org_id(), p_period_id, p_profile_id, v_amount, (select auth.uid()), p_notes)
  returning * into v_row;

  return v_row;
end $$;
