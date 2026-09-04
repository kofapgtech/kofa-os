-- 6 ------------------------------------------- the internal flag is immutable
-- Set once at insert (create_workspace will do this for new workspaces), never
-- changed afterwards. Stops both demoting the internal account and promoting a
-- second one.

create or replace function public.accounts_guard_internal()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.is_internal is distinct from old.is_internal then
    raise exception 'An account cannot be switched into or out of being the internal account'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists accounts_guard_internal on public.accounts;
create trigger accounts_guard_internal
  before update of is_internal on public.accounts
  for each row execute function public.accounts_guard_internal();
