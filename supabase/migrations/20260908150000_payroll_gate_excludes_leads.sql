-- Payroll gets its own gate, narrower than has_financial_access().
--
-- has_financial_access() answers "may this person see money" — rates, costs,
-- budgets — and includes dept_lead on purpose, because a workstream lead has
-- to cost their own workstream. Payroll was riding on that same function, so
-- pay_periods and payroll_payments were readable and writable by any lead
-- through the API, even though the UI has never shown them the Payroll screen.
-- The interface was stricter than the database, which is the wrong way round
-- for payroll.
--
-- can_manage_payroll() is the narrow one: admin and HR only, matching what the
-- frontend's isPayrollAdmin has always shown.

create or replace function public.can_manage_payroll()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and org_id = public.current_org_id()
      and role in ('admin','hr_manager') and is_active
  )
$function$;

grant execute on function public.can_manage_payroll() to authenticated;

-- ------------------------------------------------------------------ policies

drop policy if exists pay_periods_read on public.pay_periods;
create policy pay_periods_read on public.pay_periods
  for select to authenticated
  using (org_id = public.current_org_id() and public.can_manage_payroll());

drop policy if exists pay_periods_insert on public.pay_periods;
create policy pay_periods_insert on public.pay_periods
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.can_manage_payroll());

drop policy if exists pay_periods_update on public.pay_periods;
create policy pay_periods_update on public.pay_periods
  for update to authenticated
  using (org_id = public.current_org_id() and public.can_manage_payroll())
  with check (org_id = public.current_org_id());

drop policy if exists payroll_payments_read on public.payroll_payments;
create policy payroll_payments_read on public.payroll_payments
  for select to authenticated
  using (org_id = public.current_org_id() and public.can_manage_payroll());

drop policy if exists payroll_payments_insert on public.payroll_payments;
create policy payroll_payments_insert on public.payroll_payments
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.can_manage_payroll());

-- ----------------------------------------------------------------- functions
-- Bodies are unchanged from their current definitions; only the authorization
-- guard on the first line of each moves to can_manage_payroll().

create or replace function public.ensure_pay_periods(p_months_back integer default 12, p_months_ahead integer default 2)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org       uuid := public.current_org_id();
  v_cadence   public.pay_period_cadence;
  v_week_start smallint;
  v_from      date;
  v_to        date;
  v_month     timestamp;
  v_cur       date;
  v_len       integer;
begin
  if not public.can_manage_payroll() then
    raise exception 'Not authorized to manage pay periods';
  end if;

  select pay_period_cadence, week_start
    into v_cadence, v_week_start
  from public.organizations where id = v_org;

  if not found then
    raise exception 'Workspace not found';
  end if;

  v_from := (date_trunc('month', now()) - (p_months_back || ' months')::interval)::date;
  v_to   := (date_trunc('month', now()) + ((p_months_ahead + 1) || ' months')::interval
             - interval '1 day')::date;

  if v_cadence = 'semi_monthly' then
    for v_month in
      select generate_series(v_from::timestamp, v_to::timestamp, interval '1 month')
    loop
      insert into public.pay_periods (org_id, period_start, period_end)
      values (v_org, v_month::date, (v_month::date + 14))
      on conflict (org_id, period_start, period_end) do nothing;

      insert into public.pay_periods (org_id, period_start, period_end)
      values (v_org, (v_month::date + 15),
              (v_month + interval '1 month' - interval '1 day')::date)
      on conflict (org_id, period_start, period_end) do nothing;
    end loop;

  elsif v_cadence = 'monthly' then
    for v_month in
      select generate_series(v_from::timestamp, v_to::timestamp, interval '1 month')
    loop
      insert into public.pay_periods (org_id, period_start, period_end)
      values (v_org, v_month::date,
              (v_month + interval '1 month' - interval '1 day')::date)
      on conflict (org_id, period_start, period_end) do nothing;
    end loop;

  else
    -- weekly / biweekly. date_trunc('week') is Monday-based in Postgres; a
    -- workspace that starts its week on Sunday shifts back one day.
    v_len := case when v_cadence = 'weekly' then 7 else 14 end;
    v_cur := date_trunc('week', v_from::timestamp)::date
             - case when v_week_start = 0 then 1 else 0 end;

    while v_cur <= v_to loop
      insert into public.pay_periods (org_id, period_start, period_end)
      values (v_org, v_cur, v_cur + (v_len - 1))
      on conflict (org_id, period_start, period_end) do nothing;
      v_cur := v_cur + v_len;
    end loop;
  end if;
end $function$;

create or replace function public.mark_pay_period_paid(p_period_id uuid)
returns public.pay_periods
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row     public.pay_periods;
  v_org     uuid := public.current_org_id();
  v_period  public.pay_periods;
  v_names   text;
begin
  if not public.can_manage_payroll() then
    raise exception 'Not authorized to close a pay period';
  end if;

  select * into v_period from public.pay_periods where id = p_period_id and org_id = v_org;
  if not found then raise exception 'Pay period not found'; end if;

  perform public.ensure_timesheet_weeks();

  select string_agg(pr.full_name, ', ' order by pr.full_name) into v_names
    from public.profiles pr
   where pr.org_id = v_org
     and pr.employment_type = 'contractor'
     and public.unapproved_timesheet_weeks(v_org, pr.user_id, v_period.period_start, v_period.period_end) is not null;

  if v_names is not null then
    raise exception 'Cannot close this period — time is still awaiting approval for: %', v_names;
  end if;

  update public.pay_periods
     set status = 'paid', paid_at = now(), paid_by = (select auth.uid())
   where id = p_period_id and org_id = v_org
  returning * into v_row;

  return v_row;
end $function$;

create or replace function public.record_payroll_payment(p_period_id uuid, p_profile_id uuid, p_amount numeric, p_notes text default null::text)
returns public.payroll_payments
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row      public.payroll_payments;
  v_period   public.pay_periods;
  v_amount   numeric;
  v_fees     numeric;
  v_org      uuid := public.current_org_id();
  v_person   record;
  v_blocked  text;
begin
  if not public.can_manage_payroll() then
    raise exception 'Not authorized to record a payroll payment';
  end if;

  select * into v_period from public.pay_periods
   where id = p_period_id and org_id = v_org;
  if not found then raise exception 'Pay period not found'; end if;

  if v_period.period_end >= current_date then
    raise exception 'Cannot record a payment for a pay period that has not ended yet (ends %)', v_period.period_end;
  end if;

  select full_name, employment_type into v_person
    from public.profiles where user_id = p_profile_id and org_id = v_org;
  if not found then raise exception 'Profile not found'; end if;

  if v_person.employment_type = 'contractor' then
    perform public.ensure_timesheet_weeks();
    v_blocked := public.unapproved_timesheet_weeks(
                   v_org, p_profile_id, v_period.period_start, v_period.period_end);
    if v_blocked is not null then
      raise exception '% has work in this period that is not fully approved yet: %. Every week needs the workstream lead and then the managing director before it can be paid.',
        v_person.full_name, v_blocked;
    end if;
  end if;

  select coalesce(sum(cost_amount), 0) into v_amount
    from public.time_entry_costs
   where user_id = p_profile_id
     and org_id = v_org
     and entry_date between v_period.period_start and v_period.period_end;

  -- Deliverable fees earned (accepted) inside the period, on top of the hours.
  select coalesce(sum(fw.amount), 0) into v_fees
    from public.v_deliverable_fee_weeks fw
   where fw.user_id = p_profile_id
     and fw.org_id = v_org
     and fw.earned_date between v_period.period_start and v_period.period_end;

  v_amount := v_amount + v_fees;

  insert into public.payroll_payments (org_id, pay_period_id, profile_id, amount, paid_by, notes)
  values (v_org, p_period_id, p_profile_id, v_amount, (select auth.uid()), p_notes)
  returning * into v_row;

  update public.timesheet_weeks w
     set paid_at = now()
   where w.org_id = v_org
     and w.user_id = p_profile_id
     and w.status = 'approved'
     and w.paid_at is null
     and not exists (
       select 1
         from generate_series(w.week_start, w.week_start + 6, interval '1 day') g(d)
        where not exists (
          select 1 from public.pay_periods pp
            join public.payroll_payments pay
              on pay.pay_period_id = pp.id and pay.profile_id = p_profile_id
           where pp.org_id = v_org
             and g.d::date between pp.period_start and pp.period_end));

  return v_row;
end $function$;
