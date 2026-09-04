-- Avatar photo storage for the self-service Profile page.
-- Public bucket (low-sensitivity, avoids signed-URL overhead everywhere an
-- avatar renders); each user may only write under their own uid folder.
--
-- NOTE: this migration was NOT applied automatically — creating a storage
-- bucket + RLS policies on storage.objects is treated as sensitive infra by
-- the assistant's auto-mode classifier and requires a human to run it.
-- Run this once via the Supabase SQL editor, or `supabase db push`.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects for select
using (bucket_id = 'avatars');

create policy "avatars_own_upload" on storage.objects for insert
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_own_update" on storage.objects for update
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_own_delete" on storage.objects for delete
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
