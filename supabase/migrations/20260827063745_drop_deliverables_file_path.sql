-- Optional cleanup, NOT applied automatically (dropping a column is
-- destructive DDL and was blocked by the assistant's auto-mode classifier).
-- Every row that had a file_path was already copied into
-- deliverable_attachments by the 20260827063744 migration, and the
-- frontend no longer reads or writes deliverables.file_path at all as of
-- the multi-attachment rework - so this column is dead weight. Safe to run
-- whenever you like; nothing breaks if you leave it as-is either.
alter table public.deliverables drop column file_path;
