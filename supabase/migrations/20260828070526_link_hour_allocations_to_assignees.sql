-- Assignment now flows only through workstream + hour allocations (the
-- Assignees picker is gone from the task UI): committing hours to someone
-- is the act of putting them on the task, and pulling their last hours back
-- off takes them off it again. task_assignees and task_hour_allocations
-- were deliberately kept independent when hour allocations were introduced
-- (see 20260827013414_budget_planning_workstreams.sql's comment on
-- task_hour_allocations), but My Work, Profile's task stats, the global
-- timer's "my tasks" default, and the task_assigned notification are all
-- keyed off task_assignees -- so that table needs to keep tracking who's on
-- a task even though nothing edits it directly from the UI anymore.
--
-- Done as triggers (not client-side mutation logic) so every insert/delete
-- path on task_hour_allocations stays in sync automatically, including the
-- multi-step "carry hours to next month" flow in HourAllocationsSection.

create or replace function public.task_hour_allocation_sync_assignee()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.task_assignees (task_id, profile_id, org_id, added_by)
  values (new.task_id, new.profile_id, new.org_id, new.created_by)
  on conflict (task_id, profile_id) do nothing;
  return new;
end;
$function$;

create trigger task_hour_allocations_sync_assignee
  after insert on public.task_hour_allocations
  for each row execute function public.task_hour_allocation_sync_assignee();

-- Only unassigns once no hour allocation for that person on that task
-- remains in any budget month -- carrying hours from one month to the next
-- (a delete + insert pair) must not look like an unassignment.
create or replace function public.task_hour_allocation_unsync_assignee()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.task_hour_allocations
    where task_id = old.task_id and profile_id = old.profile_id
  ) then
    delete from public.task_assignees
    where task_id = old.task_id and profile_id = old.profile_id;
  end if;
  return old;
end;
$function$;

create trigger task_hour_allocations_unsync_assignee
  after delete on public.task_hour_allocations
  for each row execute function public.task_hour_allocation_unsync_assignee();
