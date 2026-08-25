-- Many-to-many task assignment, replacing single tasks.assignee_id going
-- forward. The old column and its notify trigger are left in place
-- (untouched, unread) for backward compatibility; nothing new writes to it.

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id),
  added_by uuid references public.profiles(id),
  added_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);

create index task_assignees_profile_id_idx on public.task_assignees (profile_id);

alter table public.task_assignees enable row level security;

create policy task_assignees_read on public.task_assignees
  for select to authenticated
  using (org_id = current_org_id());

create policy task_assignees_insert on public.task_assignees
  for insert to authenticated
  with check (
    org_id = current_org_id()
    and exists (
      select 1 from public.tasks t
      where t.id = task_assignees.task_id
        and t.org_id = current_org_id()
        and (
          is_lead_or_admin()
          or t.created_by = (select auth.uid())
          or exists (
            select 1 from public.workstream_members wm
            join public.workstreams w on w.id = wm.workstream_id
            where wm.profile_id = (select auth.uid())
              and wm.is_lead
              and w.project_id = t.project_id
          )
        )
    )
  );

create policy task_assignees_delete on public.task_assignees
  for delete to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_assignees.task_id
        and t.org_id = current_org_id()
        and (
          is_lead_or_admin()
          or t.created_by = (select auth.uid())
          or exists (
            select 1 from public.workstream_members wm
            join public.workstreams w on w.id = wm.workstream_id
            where wm.profile_id = (select auth.uid())
              and wm.is_lead
              and w.project_id = t.project_id
          )
        )
    )
  );

-- backfill from the existing single-assignee column
insert into public.task_assignees (task_id, profile_id, org_id, added_by, added_at)
select id, assignee_id, org_id, created_by, created_at
from public.tasks
where assignee_id is not null
on conflict do nothing;

-- notify each assignee added to a task (mirrors task_assignment_notify, keyed
-- off this join table instead of tasks.assignee_id)
create or replace function public.task_assignee_notify()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_project text;
  v_title text;
  v_due date;
begin
  if new.profile_id = (select auth.uid()) then return new; end if;

  select p.name, t.title, t.due_date into v_project, v_title, v_due
  from public.tasks t join public.projects p on p.id = t.project_id
  where t.id = new.task_id;

  insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
  values (
    new.org_id, new.profile_id, 'task_assigned',
    'New task: ' || coalesce(v_title, ''),
    coalesce(v_project, 'A project') || ' · due ' || coalesce(to_char(v_due, 'Mon DD'), 'no date'),
    'task', new.task_id
  );

  return new;
end $function$;

create trigger task_assignee_notify after insert on public.task_assignees
for each row execute function public.task_assignee_notify();
