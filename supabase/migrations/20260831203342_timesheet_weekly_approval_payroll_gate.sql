-- ========================================================= the payroll gate

/** Human-readable list of the weeks standing between a contractor and their
 *  pay, or null when nothing is. Used by both payment entry points so the
 *  error message tells finance exactly what to chase. */
create or replace function public.unapproved_timesheet_weeks(
  p_org uuid, p_user uuid, p_from date, p_to date)
returns text
language sql stable security definer
set search_path to ''
as $$
  select string_agg(
           to_char(w.week_start, 'Mon DD') ||
           coalesce(' (' || d.name || ')', '') ||
           ' — ' || (case w.status
                       when 'draft'        then 'still open'
                       when 'pending_lead' then 'awaiting workstream lead'
                       when 'pending_md'   then 'awaiting managing director'
                       when 'rejected'     then 'sent back, not resubmitted'
                       else w.status::text end),
           '; ' order by w.week_start)
    from public.timesheet_weeks w
    left join public.departments d on d.id = w.department_id
   where w.org_id = p_org
     and w.user_id = p_user
     and w.status <> 'approved'
     and exists (
       select 1 from public.v_time_entry_weeks e
        where e.org_id = w.org_id and e.user_id = w.user_id
          and e.week_start = w.week_start
          and e.department_id is not distinct from w.department_id
          and e.entry_date between p_from and p_to)
$$;

/** Bookkeeping only — records that someone was paid. Now also the third and
 *  final gate of the approval chain: a contractor's hours have to have
 *  cleared their workstream lead AND the managing director before finance
 *  can mark them paid. Employees are unaffected. */
create or replace function public.record_payroll_payment(
  p_period_id uuid, p_profile_id uuid, p_amount numeric, p_notes text default null)
returns public.payroll_payments
language plpgsql security definer
set search_path to ''
as $$
declare
  v_row      public.payroll_payments;
  v_period   public.pay_periods;
  v_amount   numeric;
  v_org      uuid := public.current_org_id();
  v_person   record;
  v_blocked  text;
begin
  if not public.has_financial_access() then
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
      raise exception '% has time in this period that is not fully approved yet: %. Every week needs the workstream lead and then the managing director before it can be paid.',
        v_person.full_name, v_blocked;
    end if;
  end if;

  select coalesce(sum(cost_amount), 0) into v_amount
    from public.time_entry_costs
   where user_id = p_profile_id
     and org_id = v_org
     and entry_date between v_period.period_start and v_period.period_end;

  insert into public.payroll_payments (org_id, pay_period_id, profile_id, amount, paid_by, notes)
  values (v_org, p_period_id, p_profile_id, v_amount, (select auth.uid()), p_notes)
  returning * into v_row;

  -- Stamp any week now fully covered by paid periods. A week straddling a
  -- period boundary waits for the other half to be paid too.
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
end $$;

/** Closing a whole period is finance's other way of saying "paid", so it
 *  carries the same gate: no contractor may still have unapproved time in it. */
create or replace function public.mark_pay_period_paid(p_period_id uuid)
returns public.pay_periods
language plpgsql security definer
set search_path to ''
as $$
declare
  v_row     public.pay_periods;
  v_org     uuid := public.current_org_id();
  v_period  public.pay_periods;
  v_names   text;
begin
  if not public.has_financial_access() then
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
end $$;
