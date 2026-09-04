-- General-purpose comment thread on a deliverable, separate from the
-- required "what needs to change" comment already captured on
-- deliverable_reviews at each stage transition. This is for open-ended
-- back-and-forth that isn't tied to moving the stage forward.
create table public.deliverable_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index deliverable_comments_deliverable_idx on public.deliverable_comments (deliverable_id, created_at);

alter table public.deliverable_comments enable row level security;

-- Same visibility as the deliverable itself: anyone in the org can read.
create policy "deliverable_comments_read" on public.deliverable_comments
for select
using (org_id = current_org_id());

-- Can only ever post as yourself.
create policy "deliverable_comments_insert" on public.deliverable_comments
for insert
with check (org_id = current_org_id() and author_id = (select auth.uid()));

-- Remove your own comment, or a lead/admin cleaning up.
create policy "deliverable_comments_delete" on public.deliverable_comments
for delete
using (org_id = current_org_id() and (author_id = (select auth.uid()) or is_lead_or_admin()));
