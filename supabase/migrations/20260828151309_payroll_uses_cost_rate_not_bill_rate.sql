-- record_payroll_payment() was summing time_entry_costs.billable_amount --
-- hours x the CLIENT bill rate, meant for invoicing the client -- instead of
-- cost_amount (hours x the person's own pay rate, i.e. what the company
-- actually owes them). For anyone not billed out to a client (most
-- contractors have bill_rate = 0 on purpose) this recorded $0 owed despite
-- real logged hours; for someone who does have both rates set, it silently
-- recorded the wrong, much larger figure (the client-billing number, not
-- the payroll number).
--
-- Same fix as the client-side usePayrollEntries() query in src/lib/queries.ts.

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

  select coalesce(sum(cost_amount), 0) into v_amount
    from public.time_entry_costs
   where user_id = p_profile_id
     and entry_date between v_period.period_start and v_period.period_end;

  insert into public.payroll_payments (org_id, pay_period_id, profile_id, amount, paid_by, notes)
  values (public.current_org_id(), p_period_id, p_profile_id, v_amount, (select auth.uid()), p_notes)
  returning * into v_row;

  return v_row;
end $$;
