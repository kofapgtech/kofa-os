-- HR gets the same roster powers as an admin, by explicit decision (2026-09-10).
-- Applied to the live project the same day.
--
-- Previously HR could only touch profiles whose role was staff or dept_lead,
-- so HR could not edit an admin's, an executive's or another HR's details at
-- all -- which blocked ordinary HR work like correcting a job title or a
-- capacity for a senior colleague. The screen was stricter still: it gated on
-- isAdmin alone, so it also locked out the managing director, who is an
-- executive and whom the database had always allowed.
--
-- The trade-off was stated and accepted: with parity, an HR account can also
-- change its own role, so HR can make itself an admin. That is intended here;
-- HR is the role that administers people in this workspace.
--
-- What does NOT change: a staff or dept_lead account still cannot alter any
-- administrative column, on their own row or anyone else's. That is the
-- privilege-escalation hole closed on 2026-09-08 and it stays closed.
-- Ownership also still moves only through transfer_workspace_ownership().

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    -- your own row (name, title, avatar -- the trigger pins the rest)
    user_id = (select auth.uid())
    -- or you administer the roster: admin, executive or HR
    or public.is_admin_exec_or_hr()
  )
  with check (
    org_id = public.current_org_id()
    and (
      user_id = (select auth.uid())
      or public.is_admin_exec_or_hr()
    )
  );

-- The column guard has to widen in step, or HR would pass the policy and then
-- be refused by the trigger.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- Ownership transfer legitimately rewrites role, and carries its own
  -- authorisation check. Same session flag profiles_guard_owner_flag uses.
  if current_setting('kofa.owner_transfer', true) = 'on' then
    return new;
  end if;

  -- No end-user context: service_role / postgres paths such as the invite
  -- trigger. RLS already keeps anon out; these are trusted server-side.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- Nothing administrative changed -- an ordinary profile edit.
  if new.role                    is not distinct from old.role
 and new.is_active               is not distinct from old.is_active
 and new.is_hidden               is not distinct from old.is_hidden
 and new.employment_type         is not distinct from old.employment_type
 and new.org_id                  is not distinct from old.org_id
 and new.user_id                 is not distinct from old.user_id
 and new.email                   is not distinct from old.email
 and new.department_id           is not distinct from old.department_id
 and new.capacity_hours_per_week is not distinct from old.capacity_hours_per_week
 and new.termination_date        is not distinct from old.termination_date
 and new.termination_reason      is not distinct from old.termination_reason
 and new.last_day_worked         is not distinct from old.last_day_worked
 and new.rehire_eligible         is not distinct from old.rehire_eligible
  then
    return new;
  end if;

  -- Admin, executive and HR administer the roster. Staff and dept_lead do not,
  -- on any row including their own.
  if public.is_admin_exec_or_hr() or public.is_platform_admin() then
    return new;
  end if;

  raise exception 'Not authorized to change administrative fields on a profile'
    using errcode = 'insufficient_privilege';
end $function$;
