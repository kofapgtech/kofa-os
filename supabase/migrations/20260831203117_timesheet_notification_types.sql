-- Weekly timesheet approval chain — enum values only.
--
-- Split out from the main migration because Postgres will not let a new enum
-- value be *used* in the same transaction that adds it. Everything that
-- references these labels lives in 20260831202900_timesheet_weekly_approval.sql.

alter type public.notification_type add value if not exists 'timesheet_submitted';
alter type public.notification_type add value if not exists 'timesheet_decided';
