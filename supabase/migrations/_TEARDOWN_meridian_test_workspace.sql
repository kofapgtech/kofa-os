-- Removes the "Meridian Studio" test workspace created on 2026-08-31 to prove
-- tenant isolation against a real second tenant.
--
-- Run this if you do NOT want a second workspace in production. Its only
-- visible effect today is that Jared, who owns both, sees a workspace switcher
-- in the header — nobody else does, because nobody else is a member of it.
--
-- NOT a migration. Run it by hand, once, if you want it gone.

do $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'meridian-studio';
  if v_org is null then
    raise notice 'Meridian Studio not found — nothing to do';
    return;
  end if;

  delete from public.active_workspace where org_id = v_org;
  delete from public.notifications         where org_id = v_org;
  delete from public.task_assignees        where org_id = v_org;
  delete from public.task_hour_allocations where org_id = v_org;
  delete from public.tasks                 where org_id = v_org;
  delete from public.projects              where org_id = v_org;
  delete from public.accounts              where org_id = v_org;
  delete from public.pay_periods           where org_id = v_org;
  delete from public.departments           where org_id = v_org;
  delete from public.profiles              where org_id = v_org;
  delete from public.organizations         where id = v_org;

  raise notice 'Meridian Studio removed';
end $$;
