-- Two holes found in the 2026-09-08 review, both confirmed by executing them
-- as a real staff user in a rolled-back transaction against the live project,
-- and both applied there on the same day.

-- 1. ANY signed-in member could promote themselves to admin.
--
-- profiles_update's first branch is `user_id = auth.uid()` so that someone can
-- edit their own name, title and avatar. It restricts the ROW but not the
-- COLUMNS, and no trigger covered `role`, so one statement from the browser
-- console -- the same shape the app's own useUpdateProfile sends -- turned a
-- staff member into an admin, at which point is_admin() genuinely passes and
-- payroll, cost rates and employee files all open up.
--
-- Rather than rewrite the policy (it serves three audiences at once), a BEFORE
-- UPDATE trigger pins the administrative columns. Self-service edits to
-- full_name, title and avatar_url are untouched.

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

  if public.is_admin_or_executive() or public.is_platform_admin() then
    return new;
  end if;

  -- HR administers the roster, but only the non-privileged tiers -- the same
  -- boundary the profiles_update policy and the invite Edge Function enforce.
  if public.current_user_role() = 'hr_manager'::public.user_role
     and old.role in ('staff'::public.user_role, 'dept_lead'::public.user_role)
     and new.role in ('staff'::public.user_role, 'dept_lead'::public.user_role)
  then
    return new;
  end if;

  raise exception 'Not authorized to change administrative fields on a profile'
    using errcode = 'insufficient_privilege';
end $function$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- 2. v_workstream_budget ran as its owner, so it ignored RLS.
--
-- Every other view in the schema is security_invoker; this one was missed. Its
-- body multiplies task hours by profile_rates.cost_rate, so it handed each
-- workstream's committed labour cost -- derived from colleagues' pay rates --
-- to anyone who asked for it over the REST API, including staff and
-- contractors, with no org predicate of its own.
alter view public.v_workstream_budget set (security_invoker = on);
