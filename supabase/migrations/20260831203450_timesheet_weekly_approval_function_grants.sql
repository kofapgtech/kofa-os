-- Match the lock-down the rest of the schema uses: nothing is callable by
-- PUBLIC/anon; the RPCs the app calls are granted to authenticated, and the
-- trigger + internal helpers are callable by nobody but the definer.

revoke all on function public.decide_timesheet_week(uuid, text, text)        from public, anon;
revoke all on function public.ensure_timesheet_weeks(integer)                from public, anon;
revoke all on function public.timesheet_week_start(timestamptz)              from public, anon;
revoke all on function public.timesheet_week_approvers(uuid, uuid)           from public, anon;
revoke all on function public.unapproved_timesheet_weeks(uuid, uuid, date, date) from public, anon;
revoke all on function public.assert_timesheet_week_open(uuid, uuid, timestamptz, uuid) from public, anon;
revoke all on function public.time_entry_week_guard()                        from public, anon, authenticated;

grant execute on function public.decide_timesheet_week(uuid, text, text) to authenticated;
grant execute on function public.ensure_timesheet_weeks(integer)         to authenticated;
grant execute on function public.timesheet_week_start(timestamptz)       to authenticated;
