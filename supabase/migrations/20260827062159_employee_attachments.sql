-- Metadata for employee documents (Admin > Employees > Attachments tab).
-- The actual file bytes live in the `employee-files` storage bucket; this
-- table is just the list of what's attached to whom.
create table public.employee_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  file_path text not null,
  file_name text not null,
  file_size bigint,
  content_type text,
  created_at timestamptz not null default now()
);

create index employee_attachments_employee_idx on public.employee_attachments (employee_id, created_at);

alter table public.employee_attachments enable row level security;

-- Same boundary AdminEmployees.tsx's `showExtraTabs` already enforces in the
-- UI, and the same one profiles_update encodes server-side: admin/executive
-- can manage anyone's attachments; HR can only manage staff/dept_lead
-- (non-privileged) employees. No self-service path - this is an HR/admin
-- document store, not exposed on the self-service Profile page.
create policy "employee_attachments_read" on public.employee_attachments
for select
using (
  org_id = current_org_id()
  and (
    is_admin_or_executive()
    or (
      current_user_role() = 'hr_manager'
      and exists (
        select 1 from public.profiles p
        where p.id = employee_attachments.employee_id
          and p.role in ('staff', 'dept_lead')
      )
    )
  )
);

create policy "employee_attachments_insert" on public.employee_attachments
for insert
with check (
  org_id = current_org_id()
  and uploaded_by = (select auth.uid())
  and (
    is_admin_or_executive()
    or (
      current_user_role() = 'hr_manager'
      and exists (
        select 1 from public.profiles p
        where p.id = employee_attachments.employee_id
          and p.role in ('staff', 'dept_lead')
      )
    )
  )
);

create policy "employee_attachments_delete" on public.employee_attachments
for delete
using (
  org_id = current_org_id()
  and (
    is_admin_or_executive()
    or (
      current_user_role() = 'hr_manager'
      and exists (
        select 1 from public.profiles p
        where p.id = employee_attachments.employee_id
          and p.role in ('staff', 'dept_lead')
      )
    )
  )
);
