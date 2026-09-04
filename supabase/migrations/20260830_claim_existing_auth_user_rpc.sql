-- Lets invite-employee recover from `422 email_exists` instead of dead-ending.
--
-- When an admin invites someone who already has an auth account but no profile
-- (the orphaned-Google-sign-in case), the right answer isn't an error -- it's
-- to build the roster row the admin just described, against the account that
-- already exists. The Edge Function can't do that lookup itself: auth.users
-- isn't reachable over PostgREST, and listUsers() has no email filter. So the
-- whole claim happens here, in one statement, service_role only.
--
-- Returns the profile id on success. Raises `already_on_roster` if the person
-- already has a profile, which invite-employee turns into a plain-English 409.

create or replace function public.admin_claim_existing_auth_user(
  p_email           text,
  p_org_id          uuid,
  p_full_name       text,
  p_role            public.user_role,
  p_department_id   uuid,
  p_title           text,
  p_capacity        numeric,
  p_employment_type public.employment_type
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email);

  if v_user_id is null then
    raise exception 'no_such_auth_user' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'already_on_roster' using errcode = 'P0001';
  end if;

  insert into public.profiles
    (id, org_id, department_id, full_name, email, role, title,
     capacity_hours_per_week, employment_type, is_active)
  values
    (v_user_id, p_org_id, p_department_id, p_full_name,
     (select email from auth.users where id = v_user_id),
     p_role, p_title, coalesce(p_capacity, 40), p_employment_type, true);

  return v_user_id;
end;
$function$;

revoke all on function public.admin_claim_existing_auth_user(
  text, uuid, text, public.user_role, uuid, text, numeric, public.employment_type
) from public, anon, authenticated;

grant execute on function public.admin_claim_existing_auth_user(
  text, uuid, text, public.user_role, uuid, text, numeric, public.employment_type
) to service_role;
