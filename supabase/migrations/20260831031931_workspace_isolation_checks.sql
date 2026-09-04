-- ============================================================================
-- Phase 2 — the isolation gate.
--
-- "No workspace can read or write another's data" is not a claim we make, it is
-- a check that passes. check_workspace_isolation() asserts the structural
-- invariants that make tenant isolation true, plus the data-level invariant
-- that no row currently references a parent in a different workspace.
--
--   select * from public.check_workspace_isolation();
--
-- Any row with status <> 'pass' blocks a deploy. Run it after every migration
-- that touches RLS, foreign keys, or the org_id column.
--
-- What it does NOT cover: it cannot sign in as a real user, so it proves the
-- policies are SHAPED correctly, not that PostgREST honours them for a given
-- JWT. That half belongs in an integration test with two real logins.
--
-- PRD: docs/PRD-Workspaces.md section 4.3
-- ============================================================================

create or replace function public.check_workspace_isolation()
returns table (check_name text, status text, detail text)
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- 1. Every org-scoped table has RLS switched on.
  return query
  select 'rls_enabled_on_org_scoped_tables',
         case when count(*) = 0 then 'pass' else 'FAIL' end,
         coalesce(string_agg(t, ', '), 'all org-scoped tables have RLS enabled')
  from (
    select c.relname as t
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      and exists (select 1 from information_schema.columns cc
                   where cc.table_schema = 'public' and cc.table_name = c.relname
                     and cc.column_name = 'org_id')
  ) x;

  -- 2. Every policy on an org-scoped table mentions org_id or current_org_id().
  --    notifications is included because it now carries the org check too.
  return query
  select 'policies_reference_org',
         case when count(*) = 0 then 'pass' else 'FAIL' end,
         coalesce(string_agg(t, ', '), 'every policy on an org-scoped table is org-aware')
  from (
    select c.relname || '.' || pol.polname as t
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and exists (select 1 from information_schema.columns cc
                   where cc.table_schema = 'public' and cc.table_name = c.relname
                     and cc.column_name = 'org_id')
      and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
           || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          not like '%org_id%'
  ) x;

  -- 3. Every FK between two org-carrying tables is composite, so Postgres
  --    itself refuses a cross-workspace parent.
  return query
  select 'foreign_keys_are_org_composite',
         case when count(*) = 0 then 'pass' else 'FAIL' end,
         coalesce(string_agg(t, ', '), 'every org-to-org foreign key includes org_id')
  from (
    select c.relname || '.' || con.conname as t
    from pg_constraint con
    join pg_class c  on c.oid  = con.conrelid
    join pg_class pc on pc.oid = con.confrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and con.contype = 'f'
      and array_length(con.conkey, 1) = 1
      and exists (select 1 from information_schema.columns cc
                   where cc.table_schema='public' and cc.table_name=c.relname  and cc.column_name='org_id')
      and exists (select 1 from information_schema.columns cc
                   where cc.table_schema='public' and cc.table_name=pc.relname and cc.column_name='org_id')
  ) x;

  -- 4. A person can hold at most one membership per workspace.
  return query
  select 'one_membership_per_person_per_workspace',
         case when exists (
           select 1 from pg_constraint
           where conname = 'profiles_user_org_key' and contype = 'u'
         ) then 'pass' else 'FAIL' end,
         'profiles unique (user_id, org_id)';

  -- 5. profiles.id must not exist. A stray `where id = auth.uid()` left in a
  --    function would silently match nothing against a surrogate key; with no
  --    such column it raises instead.
  return query
  select 'profiles_has_no_id_column',
         case when not exists (
           select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles' and column_name='id'
         ) then 'pass' else 'FAIL' end,
         'the person is profiles.user_id; the row is profiles.membership_id';

  -- 6. Data-level: nothing currently points across a workspace boundary.
  return query
  select 'no_cross_workspace_rows', case when n = 0 then 'pass' else 'FAIL' end,
         n || ' row(s) reference a parent in another workspace'
  from (
    select
      (select count(*) from public.projects p join public.accounts a on a.id = p.account_id
        where a.org_id <> p.org_id)
    + (select count(*) from public.tasks t join public.projects p on p.id = t.project_id
        where p.org_id <> t.org_id)
    + (select count(*) from public.deliverables d join public.projects p on p.id = d.project_id
        where p.org_id <> d.org_id)
    + (select count(*) from public.time_entries e join public.projects p on p.id = e.project_id
        where p.org_id <> e.org_id)
    + (select count(*) from public.task_assignees ta join public.tasks t on t.id = ta.task_id
        where t.org_id <> ta.org_id)
    + (select count(*) from public.task_hour_allocations h join public.tasks t on t.id = h.task_id
        where t.org_id <> h.org_id) as n
  ) y;

  -- 7. Every membership resolves to a workspace the person is actually in.
  return query
  select 'active_workspace_matches_a_membership',
         case when count(*) = 0 then 'pass' else 'FAIL' end,
         count(*) || ' active_workspace row(s) point at a workspace with no live membership'
  from public.active_workspace w
  where not exists (
    select 1 from public.profiles p
    where p.user_id = w.user_id and p.org_id = w.org_id and p.is_active
  );
end $$;

revoke all on function public.check_workspace_isolation() from public, anon;
grant execute on function public.check_workspace_isolation() to authenticated;

comment on function public.check_workspace_isolation() is
  'Tenant isolation gate. Any row with status <> ''pass'' blocks a deploy. Run '
  'after every migration touching RLS, foreign keys, or org_id.';
