-- ============================================================================
-- Phase 2C — composite (id, org_id) foreign keys.
--
-- RLS checks org_id on the row being written, but nothing checks that the row's
-- PARENT is in the same workspace. A crafted insert can attach a workspace-A
-- task to a workspace-B project: the insert passes tasks_insert
-- (org_id = current_org_id()) and the plain FK to projects(id) does not care
-- about org at all. Reads stay scoped, so the blast radius is limited, but it
-- is a real integrity hole and it would corrupt budget rollups.
--
-- Fix: every org-scoped child references its org-scoped parent by (id, org_id),
-- so Postgres itself refuses a cross-workspace reference.
--
-- Generic rather than a hand-written list of ~22 constraints: the pairs are
-- derived from the catalog, so a table added later is covered by re-running it,
-- and on-delete behaviour is read off the existing constraint and preserved.
--
-- PRD: docs/PRD-Workspaces.md section 4.3(a)
-- ============================================================================

-- 1 ------------------ every referenced org-scoped parent gains unique (id, org_id)

do $$
declare r record;
begin
  for r in
    select distinct pc.relname as parent
    from pg_constraint con
    join pg_class c  on c.oid  = con.conrelid
    join pg_class pc on pc.oid = con.confrelid
    join pg_namespace n on n.oid = pc.relnamespace
    where n.nspname = 'public'
      and con.contype = 'f'
      and array_length(con.conkey, 1) = 1
      and exists (select 1 from information_schema.columns cc
                   where cc.table_schema='public' and cc.table_name=pc.relname and cc.column_name='org_id')
      and exists (select 1 from information_schema.columns cc
                   where cc.table_schema='public' and cc.table_name=pc.relname and cc.column_name='id')
      and exists (select 1 from information_schema.columns cc
                   where cc.table_schema='public' and cc.table_name=c.relname  and cc.column_name='org_id')
  loop
    begin
      execute format('alter table public.%I add constraint %I unique (id, org_id)',
                     r.parent, r.parent || '_id_org_key');
    exception
      when duplicate_table or duplicate_object then null;
    end;
  end loop;
end $$;

-- 2 --------------------------- swap each single-column FK for its composite form

do $$
declare
  r record;
  v_ondelete text;
begin
  for r in
    select con.conname, con.confdeltype,
           c.relname  as child,
           pc.relname as parent,
           (select attname from pg_attribute
             where attrelid = con.conrelid and attnum = con.conkey[1]) as child_col,
           (select attname from pg_attribute
             where attrelid = con.confrelid and attnum = con.confkey[1]) as parent_col
    from pg_constraint con
    join pg_class c  on c.oid  = con.conrelid
    join pg_class pc on pc.oid = con.confrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and con.contype = 'f'
      and array_length(con.conkey, 1) = 1
      and exists (select 1 from information_schema.columns cc
                   where cc.table_schema='public' and cc.table_name=pc.relname and cc.column_name='org_id')
      and exists (select 1 from information_schema.columns cc
                   where cc.table_schema='public' and cc.table_name=c.relname  and cc.column_name='org_id')
  loop
    continue when r.parent_col <> 'id';

    v_ondelete := case r.confdeltype
      when 'c' then ' on delete cascade'
      when 'n' then ' on delete set null'
      when 'r' then ' on delete restrict'
      when 'd' then ' on delete set default'
      else ''
    end;

    execute format('alter table public.%I drop constraint %I', r.child, r.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I, org_id) references public.%I (id, org_id)%s',
      r.child, r.conname, r.child_col, r.parent, v_ondelete);
  end loop;
end $$;
