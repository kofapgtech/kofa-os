-- Deleting a workstream by hand is a foot-gun: tasks, budgets, budget
-- requests and timesheet weeks all point at it with a plain (RESTRICT) FK,
-- so a raw delete either fails with a constraint name no one can read, or --
-- for profiles.department_id, which has no FK at all -- leaves people
-- pointing at a workstream that no longer exists. This RPC is the safe door:
-- it refuses while real work still references the workstream, says exactly
-- what is in the way, and otherwise detaches its members before deleting.

create or replace function public.delete_workstream(p_department_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid := public.current_org_id();
  v_tasks int;
  v_budgets int;
  v_requests int;
  v_weeks int;
  v_allocations int;
begin
  if not public.can_manage_workstreams() then
    raise exception 'Only an admin, executive or HR can delete a workstream';
  end if;

  if not exists (
    select 1 from public.departments
    where id = p_department_id and org_id = v_org
  ) then
    raise exception 'Workstream not found in this workspace';
  end if;

  select count(*) into v_tasks
    from public.tasks where department_id = p_department_id and org_id = v_org;
  select count(*) into v_budgets
    from public.workstream_budgets where department_id = p_department_id and org_id = v_org;
  select count(*) into v_requests
    from public.workstream_budget_requests where department_id = p_department_id and org_id = v_org;
  select count(*) into v_weeks
    from public.timesheet_weeks where department_id = p_department_id and org_id = v_org;
  select count(*) into v_allocations
    from public.task_hour_allocations where department_id = p_department_id and org_id = v_org;

  if v_tasks + v_budgets + v_requests + v_weeks + v_allocations > 0 then
    raise exception
      'This workstream still has % task(s), % budget(s), % budget request(s), % timesheet week(s) and % hour allocation(s). Move or remove those first.',
      v_tasks, v_budgets, v_requests, v_weeks, v_allocations;
  end if;

  -- No FK on this one, so it has to be cleared by hand or it dangles.
  update public.profiles
  set department_id = null
  where department_id = p_department_id and org_id = v_org;

  -- department_leads and workstream_members cascade on their own.
  delete from public.departments where id = p_department_id and org_id = v_org;
end
$function$;

grant execute on function public.delete_workstream(uuid) to authenticated;
