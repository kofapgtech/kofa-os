-- ==================================================================== views

/** What every queue in the UI reads: the week plus who it belongs to, which
 *  workstream it is, how much time sits in it, and the names behind each
 *  approval stamp. cost_amount comes from time_entry_costs, which is itself
 *  RLS'd to people with financial access — so a contractor reading their own
 *  row simply sees 0 there rather than being refused the row. */
create or replace view public.v_timesheet_weeks
with (security_invoker = on) as
select
  w.id, w.org_id, w.user_id, w.week_start, w.department_id, w.status,
  w.submitted_at, w.lead_approved_by, w.lead_approved_at,
  w.md_approved_by, w.md_approved_at,
  w.rejected_by, w.rejected_at, w.rejection_comment, w.paid_at,
  w.created_at, w.updated_at,
  pr.full_name  as user_name,
  d.name        as department_name,
  d.color       as department_color,
  coalesce(agg.total_minutes, 0)::integer as total_minutes,
  coalesce(agg.entry_count, 0)::integer   as entry_count,
  coalesce(cost.cost_amount, 0)::numeric  as cost_amount,
  lead_p.full_name as lead_approved_by_name,
  md_p.full_name   as md_approved_by_name,
  rej_p.full_name  as rejected_by_name
from public.timesheet_weeks w
left join public.profiles    pr on pr.user_id = w.user_id and pr.org_id = w.org_id
left join public.departments d  on d.id = w.department_id
left join lateral (
  select sum(e.duration_minutes) as total_minutes, count(*) as entry_count
    from public.v_time_entry_weeks e
   where e.org_id = w.org_id and e.user_id = w.user_id
     and e.week_start = w.week_start
     and e.department_id is not distinct from w.department_id
) agg on true
left join lateral (
  select sum(c.cost_amount) as cost_amount
    from public.v_time_entry_weeks e
    join public.time_entry_costs c on c.time_entry_id = e.time_entry_id
   where e.org_id = w.org_id and e.user_id = w.user_id
     and e.week_start = w.week_start
     and e.department_id is not distinct from w.department_id
) cost on true
left join public.profiles lead_p on lead_p.user_id = w.lead_approved_by and lead_p.org_id = w.org_id
left join public.profiles md_p   on md_p.user_id   = w.md_approved_by   and md_p.org_id   = w.org_id
left join public.profiles rej_p  on rej_p.user_id  = w.rejected_by      and rej_p.org_id  = w.org_id;

-- ====================================================================== RLS

alter table public.timesheet_weeks        enable row level security;
alter table public.timesheet_week_reviews enable row level security;

-- Read only. Every state change goes through decide_timesheet_week() /
-- ensure_timesheet_weeks(), so there are deliberately no write policies.
create policy timesheet_weeks_read on public.timesheet_weeks
  for select using (
    org_id = public.current_org_id()
    and ( user_id = (select auth.uid())
       or public.is_lead_or_admin()
       or public.has_financial_access() )
  );

create policy timesheet_week_reviews_read on public.timesheet_week_reviews
  for select using (
    org_id = public.current_org_id()
    and ( public.is_lead_or_admin()
       or public.has_financial_access()
       or exists (select 1 from public.timesheet_weeks w
                   where w.id = timesheet_week_id and w.user_id = (select auth.uid())) )
  );

grant select on public.timesheet_weeks        to authenticated;
grant select on public.timesheet_week_reviews to authenticated;
grant select on public.v_timesheet_weeks      to authenticated;
grant select on public.v_time_entry_weeks     to authenticated;
