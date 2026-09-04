-- The week lock applies to the PERSON whose time it is, not to every write.
--
-- The first cut refused any change to a locked week from anybody. That is
-- right for the case it was written for — a contractor quietly editing hours
-- an approver has already signed off — but it also caught writes that are
-- nobody's edit at all: deleting a task cascades ON DELETE SET NULL onto its
-- time entries, deleting a project or a workspace cascades a delete, and each
-- of those would have failed with a timesheet error.
--
-- So the guard now fires only when the person doing the writing is the person
-- the time belongs to. Everyone else is already bounded by RLS on
-- time_entries (your own rows, or admin/executive), and an admin correcting a
-- locked week is a deliberate override rather than something to block — the
-- supported route back is still decide_timesheet_week('reject'/'reopen'),
-- which unlocks the week and records who unlocked it.

create or replace function public.time_entry_week_guard()
returns trigger
language plpgsql security definer
set search_path to ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.user_id = v_actor then
    perform public.assert_timesheet_week_open(old.org_id, old.user_id, old.started_at, old.task_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.user_id = v_actor then
    perform public.assert_timesheet_week_open(
      coalesce(new.org_id, (select org_id from public.projects where id = new.project_id)),
      new.user_id, new.started_at, new.task_id);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

revoke all on function public.time_entry_week_guard() from public, anon, authenticated;

-- Belt and braces for a hard workspace delete: clear the week rows first, so
-- the cascade onto time_entries can never race the guard.
create or replace function public.timesheet_weeks_clear_for_org()
returns trigger
language plpgsql security definer
set search_path to ''
as $$
begin
  delete from public.timesheet_week_reviews where org_id = old.id;
  delete from public.timesheet_weeks        where org_id = old.id;
  return old;
end $$;

revoke all on function public.timesheet_weeks_clear_for_org() from public, anon, authenticated;

create trigger organizations_clear_timesheet_weeks
  before delete on public.organizations
  for each row execute function public.timesheet_weeks_clear_for_org();
