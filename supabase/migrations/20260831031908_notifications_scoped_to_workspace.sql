-- ============================================================================
-- Phase 2D — scope notifications and the HR attachment guard to the workspace.
--
-- notifications RLS keyed on user_id alone. That was correct while one person
-- meant one workspace; the moment memberships are many-to-one it means someone
-- working in workspace B sees workspace A's notifications.
--
-- The employee_attachments policies check a person's role via an EXISTS on
-- profiles with no org filter — which, with two memberships, could match the
-- WRONG membership row (staff in A, dept_lead in B) and grant HR access it
-- shouldn't have.
--
-- PRD: docs/PRD-Workspaces.md section 4.3(b)
-- ============================================================================

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select using (
    user_id = (select auth.uid()) and org_id = public.current_org_id()
  );

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update
  using  (user_id = (select auth.uid()) and org_id = public.current_org_id())
  with check (user_id = (select auth.uid()) and org_id = public.current_org_id());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete using (
    user_id = (select auth.uid()) and org_id = public.current_org_id()
  );

-- The HR branch must resolve the role on the membership in THIS workspace.

drop policy if exists employee_attachments_read on public.employee_attachments;
create policy employee_attachments_read on public.employee_attachments
  for select using (
    org_id = public.current_org_id()
    and (
      public.is_admin_or_executive()
      or (public.current_user_role() = 'hr_manager'
          and exists (
            select 1 from public.profiles p
            where p.user_id = employee_attachments.employee_id
              and p.org_id = public.current_org_id()
              and p.role in ('staff','dept_lead')))
    )
  );

drop policy if exists employee_attachments_insert on public.employee_attachments;
create policy employee_attachments_insert on public.employee_attachments
  for insert with check (
    org_id = public.current_org_id()
    and uploaded_by = (select auth.uid())
    and (
      public.is_admin_or_executive()
      or (public.current_user_role() = 'hr_manager'
          and exists (
            select 1 from public.profiles p
            where p.user_id = employee_attachments.employee_id
              and p.org_id = public.current_org_id()
              and p.role in ('staff','dept_lead')))
    )
  );

drop policy if exists employee_attachments_delete on public.employee_attachments;
create policy employee_attachments_delete on public.employee_attachments
  for delete using (
    org_id = public.current_org_id()
    and (
      public.is_admin_or_executive()
      or (public.current_user_role() = 'hr_manager'
          and exists (
            select 1 from public.profiles p
            where p.user_id = employee_attachments.employee_id
              and p.org_id = public.current_org_id()
              and p.role in ('staff','dept_lead')))
    )
  );
