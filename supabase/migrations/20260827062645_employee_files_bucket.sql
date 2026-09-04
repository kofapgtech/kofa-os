-- Storage for employee documents (Admin > Employees > Attachments tab).
-- Private bucket, scoped the same way deliverable-files is: first path
-- segment is the org_id, so cross-org access is impossible regardless of
-- row-level checks. The finer-grained "HR can't touch a privileged
-- employee's row" boundary is enforced at the employee_attachments table
-- level (see the 20260827062159_employee_attachments migration) and in the
-- UI (AdminEmployees.tsx `showExtraTabs`); this storage policy only needs
-- the coarser org + role check, matching how deliverable_files_* policies
-- are coarser than the app-level deliverables RLS.
--
-- NOTE: this migration was NOT applied automatically — creating a storage
-- bucket + RLS policies on storage.objects is treated as sensitive infra by
-- the assistant's auto-mode classifier and requires a human to run it.
-- Run this once via the Supabase SQL editor, or `supabase db push`.

insert into storage.buckets (id, name, public)
values ('employee-files', 'employee-files', false)
on conflict (id) do nothing;

create policy "employee_files_read" on storage.objects for select
using (
  bucket_id = 'employee-files'
  and (storage.foldername(name))[1] = (current_org_id())::text
  and (is_admin_or_executive() or current_user_role() = 'hr_manager')
);

create policy "employee_files_upload" on storage.objects for insert
with check (
  bucket_id = 'employee-files'
  and (storage.foldername(name))[1] = (current_org_id())::text
  and (is_admin_or_executive() or current_user_role() = 'hr_manager')
);

create policy "employee_files_delete" on storage.objects for delete
using (
  bucket_id = 'employee-files'
  and (storage.foldername(name))[1] = (current_org_id())::text
  and (is_admin_or_executive() or current_user_role() = 'hr_manager')
);
