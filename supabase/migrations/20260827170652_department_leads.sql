-- Lets a profile be tagged as an additional lead of a workstream (department)
-- WITHOUT changing their department_id/role - the existing "member with
-- role='dept_lead'" convention only ever gives one workstream per person,
-- since department_id is single-valued. Executives (and admins) already
-- have full lead-tier access to every workstream server-side
-- (is_lead_or_admin()/is_admin_or_executive() don't check department_id at
-- all) - this table is purely for correctly ATTRIBUTING/displaying who
-- leads what, and for MyWork's "tasks waiting for you to staff" queue to
-- pick up every workstream someone actually leads, not just the one they
-- happen to be staffed in.
create table public.department_leads (
  department_id uuid not null references public.departments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, profile_id)
);

create index department_leads_profile_idx on public.department_leads (profile_id);

alter table public.department_leads enable row level security;

create policy "department_leads_read" on public.department_leads
for select
using (org_id = current_org_id());

-- Same boundary as everything else on the Workstreams admin page
-- (AdminDepartments.tsx is already gated to isAdminOrExecutive).
create policy "department_leads_write" on public.department_leads
for insert
with check (org_id = current_org_id() and is_admin_or_executive());

create policy "department_leads_delete" on public.department_leads
for delete
using (org_id = current_org_id() and is_admin_or_executive());
