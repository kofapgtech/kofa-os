-- Per-employee payroll payments, plus biweekly pay-period auto-generation
-- (1st-15th and 16th-end-of-month), so periods don't need hand-inserting.

alter table public.pay_periods
  add constraint pay_periods_org_dates_key unique (org_id, period_start, period_end);

create table public.payroll_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  pay_period_id uuid not null references public.pay_periods(id),
  profile_id uuid not null references public.profiles(id),
  amount numeric not null default 0,
  paid_at timestamptz not null default now(),
  paid_by uuid references public.profiles(id),
  notes text,
  -- Reserved for the upcoming Deel payout trigger; unused for now.
  deel_reference text,
  created_at timestamptz not null default now(),
  unique (pay_period_id, profile_id)
);

alter table public.payroll_payments enable row level security;

create policy payroll_payments_read on public.payroll_payments
  for select to authenticated
  using (org_id = public.current_org_id() and public.has_financial_access());

create policy payroll_payments_insert on public.payroll_payments
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_financial_access());

-- One payment per employee per period. Goes through an RPC (like
-- mark_pay_period_paid) so authorization is enforced server-side and the
-- unique constraint turns a double-click into a clean error, not a double pay.
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
begin
  if not public.has_financial_access() then
    raise exception 'Not authorized to record a payroll payment';
  end if;

  insert into public.payroll_payments (org_id, pay_period_id, profile_id, amount, paid_by, notes)
  values (public.current_org_id(), p_period_id, p_profile_id, p_amount, (select auth.uid()), p_notes)
  returning * into v_row;

  return v_row;
end $$;

-- Ensures biweekly pay periods exist for the caller's org across a rolling
-- window (defaults: a year back, two months ahead). Idempotent via the
-- unique constraint above, so it's safe to call on every Payroll page load.
create or replace function public.ensure_pay_periods(
  p_months_back int default 12,
  p_months_ahead int default 2
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_org uuid := public.current_org_id();
  v_month date;
begin
  if not public.has_financial_access() then
    raise exception 'Not authorized to manage pay periods';
  end if;

  for v_month in
    select generate_series(
      date_trunc('month', now()) - (p_months_back || ' months')::interval,
      date_trunc('month', now()) + (p_months_ahead || ' months')::interval,
      interval '1 month'
    )::date
  loop
    insert into public.pay_periods (org_id, period_start, period_end)
    values (v_org, v_month, v_month + 14)
    on conflict (org_id, period_start, period_end) do nothing;

    insert into public.pay_periods (org_id, period_start, period_end)
    values (v_org, v_month + 15, (v_month + interval '1 month' - interval '1 day')::date)
    on conflict (org_id, period_start, period_end) do nothing;
  end loop;
end $$;

-- Postgres grants EXECUTE to PUBLIC by default, which anon/authenticated
-- both inherit; match the rest of this schema's financial RPCs (e.g.
-- mark_pay_period_paid) by revoking the blanket public grant and then
-- explicitly re-granting to authenticated only. (has_financial_access()
-- already denies anon internally, but keep the grant surface consistent.)
revoke execute on function public.ensure_pay_periods(int, int) from anon, public;
revoke execute on function public.record_payroll_payment(uuid, uuid, numeric, text) from anon, public;
grant execute on function public.ensure_pay_periods(int, int) to authenticated;
grant execute on function public.record_payroll_payment(uuid, uuid, numeric, text) to authenticated;
