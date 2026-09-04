-- Multiple files AND links per deliverable, replacing the single
-- deliverables.file_path column (which could only ever hold one of either).
create table public.deliverable_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  added_by uuid not null references public.profiles(id),
  kind text not null check (kind in ('file', 'link')),
  file_path text,
  url text,
  label text not null,
  file_size bigint,
  content_type text,
  created_at timestamptz not null default now(),
  constraint deliverable_attachments_shape check (
    (kind = 'file' and file_path is not null and url is null)
    or
    (kind = 'link' and url is not null and file_path is null)
  )
);

create index deliverable_attachments_deliverable_idx on public.deliverable_attachments (deliverable_id, created_at);

alter table public.deliverable_attachments enable row level security;

-- Same visibility as the deliverable itself.
create policy "deliverable_attachments_read" on public.deliverable_attachments
for select
using (org_id = current_org_id());

-- Same boundary as deliverables_update: lead/admin, or the deliverable's
-- own owner/reviewer - whoever could already edit file_path before.
create policy "deliverable_attachments_insert" on public.deliverable_attachments
for insert
with check (
  org_id = current_org_id()
  and added_by = (select auth.uid())
  and exists (
    select 1 from public.deliverables d
    where d.id = deliverable_attachments.deliverable_id
      and d.org_id = current_org_id()
      and (is_lead_or_admin() or d.owner_id = (select auth.uid()) or d.reviewer_id = (select auth.uid()))
  )
);

create policy "deliverable_attachments_delete" on public.deliverable_attachments
for delete
using (
  org_id = current_org_id()
  and (
    added_by = (select auth.uid())
    or is_lead_or_admin()
    or exists (
      select 1 from public.deliverables d
      where d.id = deliverable_attachments.deliverable_id
        and d.org_id = current_org_id()
        and (d.owner_id = (select auth.uid()) or d.reviewer_id = (select auth.uid()))
    )
  )
);

-- Backfill: carry over any existing single file_path/link onto the new
-- table so nothing already attached goes missing.
insert into public.deliverable_attachments (org_id, deliverable_id, added_by, kind, file_path, url, label)
select
  org_id,
  id,
  coalesce(owner_id, reviewer_id),
  case when file_path ~ '^https?://' then 'link' else 'file' end,
  case when file_path ~ '^https?://' then null else file_path end,
  case when file_path ~ '^https?://' then file_path else null end,
  case when file_path ~ '^https?://' then file_path else regexp_replace(file_path, '^.*/', '') end
from public.deliverables
where file_path is not null
  and coalesce(owner_id, reviewer_id) is not null;
