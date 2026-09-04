-- Orphaned auth users: the bug this fixes
-- ---------------------------------------
-- `handle_new_user()` only built a profiles row when `org_id` was already in
-- `raw_user_meta_data`, which ONLY the invite-employee Edge Function puts
-- there. A Google sign-in never carries it, so an employee who signed in with
-- Google before being invited got a live `auth.users` row and no profile:
-- invisible on the roster, "No workspace access" in the app, and -- because
-- the email now exists in auth -- `inviteUserByEmail` for them failed with
-- 422 email_exists forever after. That is exactly what happened to
-- lizbeth@kofapg.com and jerry@kofapg.com on 2026-08-28.
--
-- Two changes here:
--   1. The org's email domains move out of hardcoded SQL into a real table,
--      so the domain -> org mapping has one source of truth. The previous
--      migration (restrict_new_auth_users_to_org_domain) hardcoded
--      'kofapg.com' in a function body; the Workspaces epic needs this
--      per-workspace anyway, so it becomes data now rather than another
--      single-org assumption to unpick later.
--   2. Profile creation auto-provisions from that mapping when metadata has
--      no org_id, and runs on sign-in as well as on user creation, so a
--      profile-less auth user can no longer exist or persist.

-- 1. Domain -> organisation mapping ------------------------------------------

create table if not exists public.org_email_domains (
  domain     text primary key check (domain = lower(domain) and domain like '%.%'),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.org_email_domains is
  'Work-email domains that map to an organisation. Anyone signing in with an '
  'address on one of these domains is admitted to that org and auto-provisioned '
  'a staff profile; anyone else is rejected at auth.users insert.';

create index if not exists org_email_domains_org_id_idx
  on public.org_email_domains (org_id);

alter table public.org_email_domains enable row level security;

drop policy if exists org_email_domains_read on public.org_email_domains;
create policy org_email_domains_read on public.org_email_domains
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists org_email_domains_write on public.org_email_domains;
create policy org_email_domains_write on public.org_email_domains
  for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());

revoke all on public.org_email_domains from anon;

-- Seed the one domain the old function hardcoded.
insert into public.org_email_domains (domain, org_id)
select 'kofapg.com', o.id from public.organizations o
order by o.created_at
limit 1
on conflict (domain) do nothing;

-- 2. Admission check, now table-driven ---------------------------------------

create or replace function public.restrict_new_auth_users_to_org_domain()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- An invited signup already carries its org, stamped by invite-employee.
  if nullif(new.raw_user_meta_data ->> 'org_id', '') is not null then
    return new;
  end if;

  if new.email is null
     or not exists (
       select 1 from public.org_email_domains d
       where d.domain = lower(split_part(new.email, '@', 2))
     )
  then
    raise exception 'Sign-in is limited to your organisation''s work email addresses.';
  end if;

  return new;
end;
$function$;

-- 3. Profile provisioning ------------------------------------------------------

create or replace function public.ensure_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid := nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid;
begin
  -- Invited users bring their org in metadata (invite-employee sets it, along
  -- with the role/department/title the admin chose). Everyone else got past
  -- restrict_new_auth_users_to_org_domain because their email domain is on
  -- the org's list -- so resolve the org from that and give them the default
  -- staff profile. Without this fallback they end up as an auth user with no
  -- roster row, which is unrecoverable through the invite flow.
  if v_org is null and new.email is not null then
    select d.org_id into v_org
    from public.org_email_domains d
    where d.domain = lower(split_part(new.email, '@', 2));
  end if;

  if v_org is null then
    return new;
  end if;

  insert into public.profiles
    (id, org_id, department_id, full_name, email, role, title,
     capacity_hours_per_week, employment_type, avatar_url)
  values (
    new.id,
    v_org,
    nullif(new.raw_user_meta_data ->> 'department_id', '')::uuid,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'staff')::public.user_role,
    nullif(new.raw_user_meta_data ->> 'title', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'capacity_hours_per_week', '')::numeric, 40),
    coalesce(nullif(new.raw_user_meta_data ->> 'employment_type', ''), 'employee')::public.employment_type,
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

comment on function public.ensure_profile_for_auth_user() is
  'Idempotently guarantees an auth user has a profiles row. Fires on user '
  'creation and again on every sign-in, so an account that predates this '
  'migration (or slips through some future path) self-heals on next login.';

-- Repoint the creation trigger, and add the sign-in safety net. The UPDATE
-- trigger is what rescues accounts created before this migration: they get
-- their profile the next time they log in, instead of staying stranded.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.ensure_profile_for_auth_user();

drop trigger if exists on_auth_user_signed_in on auth.users;
create trigger on_auth_user_signed_in
  after update on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.ensure_profile_for_auth_user();

drop function if exists public.handle_new_user();

-- Both of these return `trigger`, so a PostgREST /rpc call could never do
-- anything useful with them -- but they're SECURITY DEFINER and sitting in the
-- exposed `public` schema, which the database linter rightly flags. Take the
-- grant away rather than leave a standing warning.
revoke all on function public.ensure_profile_for_auth_user() from public, anon, authenticated;
revoke all on function public.restrict_new_auth_users_to_org_domain() from public, anon, authenticated;
