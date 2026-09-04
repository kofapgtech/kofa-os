-- ================================================== workspace reset awareness

/** Unchanged except for the two new tables: they are archived alongside
 *  everything else, and — importantly — deleted BEFORE time_entries, since
 *  the week guard would otherwise refuse to let an approved week's entries go. */
create or replace function public.reset_workspace()
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_org     uuid := public.current_org_id();
  v_me      uuid := (select auth.uid());
  v_archive jsonb;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_org is null then raise exception 'No active workspace'; end if;

  if not (public.is_platform_admin() or public.is_workspace_owner()) then
    raise exception 'Only a workspace owner or platform staff can reset a workspace';
  end if;

  select jsonb_build_object(
    'accounts',                  (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.accounts t where t.org_id = v_org and not t.is_internal),
    'account_share_links',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.account_share_links t where t.org_id = v_org),
    'projects',                  (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.projects t where t.org_id = v_org),
    'tasks',                     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tasks t where t.org_id = v_org),
    'task_assignees',            (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.task_assignees t where t.org_id = v_org),
    'task_hour_allocations',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.task_hour_allocations t where t.org_id = v_org),
    'task_time_requests',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.task_time_requests t where t.org_id = v_org),
    'time_entries',              (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.time_entries t where t.org_id = v_org),
    'time_entry_costs',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.time_entry_costs t where t.org_id = v_org),
    'timesheet_weeks',           (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.timesheet_weeks t where t.org_id = v_org),
    'timesheet_week_reviews',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.timesheet_week_reviews t where t.org_id = v_org),
    'deliverables',              (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.deliverables t where t.org_id = v_org),
    'deliverable_attachments',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.deliverable_attachments t where t.org_id = v_org),
    'deliverable_comments',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.deliverable_comments t where t.org_id = v_org),
    'deliverable_reviews',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.deliverable_reviews t where t.org_id = v_org),
    'project_monthly_budgets',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.project_monthly_budgets t where t.org_id = v_org),
    'workstream_budgets',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.workstream_budgets t where t.org_id = v_org),
    'workstream_budget_requests',(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.workstream_budget_requests t where t.org_id = v_org),
    'payroll_payments',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.payroll_payments t where t.org_id = v_org),
    'pay_periods',               (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pay_periods t where t.org_id = v_org),
    'notifications',             (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.notifications t where t.org_id = v_org)
  ) into v_archive;

  insert into public.workspace_reset_archives (org_id, reset_by, data)
  values (v_org, v_me, v_archive);

  delete from public.deliverable_attachments   where org_id = v_org;
  delete from public.deliverable_comments      where org_id = v_org;
  delete from public.deliverable_reviews       where org_id = v_org;
  delete from public.deliverables              where org_id = v_org;
  delete from public.task_hour_allocations     where org_id = v_org;
  delete from public.task_assignees            where org_id = v_org;
  delete from public.task_time_requests        where org_id = v_org;
  delete from public.timesheet_week_reviews    where org_id = v_org;
  delete from public.timesheet_weeks           where org_id = v_org;
  delete from public.tasks                     where org_id = v_org;
  delete from public.time_entry_costs          where org_id = v_org;
  delete from public.time_entries              where org_id = v_org;
  delete from public.project_monthly_budgets   where org_id = v_org;
  delete from public.workstream_budget_requests where org_id = v_org;
  delete from public.workstream_budgets        where org_id = v_org;
  delete from public.payroll_payments          where org_id = v_org;
  delete from public.pay_periods               where org_id = v_org;
  delete from public.account_share_links       where org_id = v_org;
  delete from public.projects                  where org_id = v_org;
  delete from public.accounts                  where org_id = v_org and not is_internal;
  delete from public.notifications             where org_id = v_org;

  perform public.ensure_pay_periods(12, 2);
end $$;

-- ============================================================== backfill

-- Bring existing contractor time into the chain, but do NOT retroactively
-- lock or auto-approve anything: past weeks land in 'pending_lead' so the
-- leads and the MD walk them once, and nothing that was already paid is
-- touched (those weeks are stamped straight to 'approved' + paid).
do $$
declare v_org uuid;
begin
  for v_org in select id from public.organizations loop
    insert into public.timesheet_weeks (org_id, user_id, week_start, department_id)
    select w.org_id, w.user_id, w.week_start, w.department_id
      from public.v_time_entry_weeks w
      join public.profiles pr on pr.user_id = w.user_id and pr.org_id = w.org_id
     where w.org_id = v_org and pr.employment_type = 'contractor'
     group by w.org_id, w.user_id, w.week_start, w.department_id
    on conflict (org_id, user_id, week_start, department_id) do nothing;
  end loop;

  -- Weeks already covered by a recorded payroll payment are history, not a queue.
  update public.timesheet_weeks w
     set status = 'approved', submitted_at = w.created_at,
         lead_approved_at = w.created_at, md_approved_at = w.created_at, paid_at = now()
   where not exists (
     select 1
       from generate_series(w.week_start, w.week_start + 6, interval '1 day') g(d)
      where not exists (
        select 1 from public.pay_periods pp
          join public.payroll_payments pay
            on pay.pay_period_id = pp.id and pay.profile_id = w.user_id
         where pp.org_id = w.org_id
           and g.d::date between pp.period_start and pp.period_end));

  -- Everything else that has finished goes into the leads' queue.
  update public.timesheet_weeks
     set status = 'pending_lead', submitted_at = now()
   where status = 'draft' and week_start + 7 <= current_date;
end $$;
