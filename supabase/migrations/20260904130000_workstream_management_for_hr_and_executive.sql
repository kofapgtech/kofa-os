-- Workstream management becomes its own permission rather than "admin only".
-- HR owns the org chart now, and executive -- which already has every other
-- admin-tier power -- stops being silently blocked by the DB on a page it can
-- already open.

create or replace function public.can_manage_workstreams()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and org_id = public.current_org_id()
      and role in ('admin','executive','hr_manager') and is_active
  )
$function$;

grant execute on function public.can_manage_workstreams() to authenticated;

-- departments: create / rename / delete
drop policy if exists dept_insert on public.departments;
create policy dept_insert on public.departments
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.can_manage_workstreams());

drop policy if exists dept_update on public.departments;
create policy dept_update on public.departments
  for update to authenticated
  using (org_id = public.current_org_id() and public.can_manage_workstreams())
  with check (org_id = public.current_org_id());

drop policy if exists dept_delete on public.departments;
create policy dept_delete on public.departments
  for delete to authenticated
  using (org_id = public.current_org_id() and public.can_manage_workstreams());

-- department_leads: the "additional lead" tags
drop policy if exists department_leads_write on public.department_leads;
create policy department_leads_write on public.department_leads
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.can_manage_workstreams());

drop policy if exists department_leads_delete on public.department_leads;
create policy department_leads_delete on public.department_leads
  for delete to authenticated
  using (org_id = public.current_org_id() and public.can_manage_workstreams());
