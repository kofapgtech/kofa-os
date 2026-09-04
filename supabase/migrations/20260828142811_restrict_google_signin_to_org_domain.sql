-- Google sign-in has no invite-record check the way the password/magic-link
-- path implicitly does (an admin's invite-employee call is what stamps
-- org_id into raw_user_meta_data, which is what handle_new_user() requires
-- before it will build a profiles row). Left alone, any Google account could
-- complete the OAuth flow and mint a real auth.users row + session -- they'd
-- land on "No workspace access" with zero data (RLS still blocks them,
-- see current_org_id()), but they'd still be a live, unremoved account.
--
-- This rejects the auth.users insert outright -- no session, no orphan row
-- -- for anyone who isn't either (a) an invited signup (org_id already in
-- their metadata) or (b) on the organization's own email domain. Google's
-- own `hd` sign-in param (set client-side in AuthContext.signInWithGoogle)
-- narrows the account picker to the same domain as a UX nicety, but only
-- this trigger actually enforces it.

create or replace function public.restrict_new_auth_users_to_org_domain()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (new.raw_user_meta_data ->> 'org_id') is not null then
    return new;
  end if;

  if new.email is null or lower(split_part(new.email, '@', 2)) <> 'kofapg.com' then
    raise exception 'Sign-in is limited to Kofa P/G work email addresses.';
  end if;

  return new;
end;
$function$;

create trigger restrict_new_auth_users_to_org_domain
  before insert on auth.users
  for each row execute function public.restrict_new_auth_users_to_org_domain();
