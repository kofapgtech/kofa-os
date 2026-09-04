-- One-time repair of the two accounts stranded by the orphaned-auth-user bug
-- (see 20260830_org_email_domains_auto_provision.sql for the cause).
--
-- Lizbeth Herrera and Jerry both signed in with Google on 2026-08-28 before
-- anyone invited them, so each got an auth.users row and no profile. Neither
-- can be fixed through the invite flow -- their emails already exist in auth,
-- so inviteUserByEmail returns 422 email_exists.
--
--  * Lizbeth had no roster record at all -> create one, using the details the
--    admin entered in the invite form (Tech/Tools, Research, contractor, 10h).
--  * Jerry DID have a roster record, but it was seed data attached to a
--    different auth account (nia@kofapg.com) and carrying the wrong email
--    (tech@kofapg.com). It also owns 227 rows of real history -- time entries,
--    tasks, a payroll payment. So rather than create a second Jerry, move that
--    record onto his real Google account id: clone the row under the new id,
--    repoint every FK, drop the old row. Done in one transaction; the FKs are
--    NO ACTION, so if any child were missed the final delete would fail rather
--    than silently orphan anything.

do $$
declare
  v_lizbeth_auth uuid;
  v_jerry_auth   uuid;
  v_jerry_old    uuid;
  r record;
begin
  select id into v_lizbeth_auth from auth.users where lower(email) = 'lizbeth@kofapg.com';
  select id into v_jerry_auth   from auth.users where lower(email) = 'jerry@kofapg.com';

  -- Lizbeth: straight insert, no history to carry.
  if v_lizbeth_auth is not null then
    insert into public.profiles
      (id, org_id, department_id, full_name, email, role, title,
       capacity_hours_per_week, employment_type, is_active)
    select
      v_lizbeth_auth,
      (select org_id from public.org_email_domains where domain = 'kofapg.com'),
      (select id from public.departments where name = 'Tech/Tools'),
      'Lizbeth Herrera',
      'lizbeth@kofapg.com',
      'staff'::public.user_role,
      'Research',
      10,
      'contractor'::public.employment_type,
      true
    on conflict (id) do nothing;
  end if;

  -- Jerry: move the existing record onto his real auth account.
  select id into v_jerry_old
  from public.profiles
  where full_name = 'Jerry' and email = 'tech@kofapg.com';

  if v_jerry_auth is not null and v_jerry_old is not null and v_jerry_old <> v_jerry_auth then

    insert into public.profiles
      (id, org_id, department_id, full_name, email, role, title,
       capacity_hours_per_week, avatar_url, is_active, created_at, updated_at,
       employment_type, termination_date, termination_reason, last_day_worked,
       rehire_eligible)
    select
      v_jerry_auth, org_id, department_id, full_name, 'jerry@kofapg.com', role, title,
      capacity_hours_per_week, avatar_url, is_active, created_at, now(),
      employment_type, termination_date, termination_reason, last_day_worked,
      rehire_eligible
    from public.profiles where id = v_jerry_old
    on conflict (id) do nothing;

    -- Every FK column that points at profiles(id), whether or not it currently
    -- holds a Jerry row -- driven off the catalogue so nothing is missed.
    for r in
      select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join unnest(c.conkey) with ordinality k(attnum, ord) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
    loop
      execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col)
        using v_jerry_auth, v_jerry_old;
    end loop;

    delete from public.profiles where id = v_jerry_old;
  end if;
end $$;
