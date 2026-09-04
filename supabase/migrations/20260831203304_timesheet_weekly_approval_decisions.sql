-- ============================================================== the decisions

/** The single write path for a timesheet week. Every state change goes
 *  through here so the guard rails (who may act, from which state, and
 *  whether a comment is required) can't be side-stepped by a table write.
 *
 *    lead_approve  pending_lead -> pending_md   workstream lead
 *    md_approve    pending_md   -> approved     admin / executive (the MD)
 *    reject        any open     -> rejected     lead or MD, comment required
 *    resubmit      rejected     -> pending_lead the person themselves
 *    reopen        approved     -> pending_lead admin / executive
 */
create or replace function public.decide_timesheet_week(
  p_week_id uuid, p_decision text, p_comment text default null)
returns public.timesheet_weeks
language plpgsql security definer
set search_path to ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_me      record;
  w         public.timesheet_weeks;
  v_row     public.timesheet_weeks;
  v_dec     text := lower(btrim(coalesce(p_decision, '')));
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_is_lead boolean;
  v_dept    text;
  v_label   text;
  u         uuid;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;

  select user_id, org_id, role, full_name into v_me
    from public.profiles
   where user_id = v_actor and org_id = public.current_org_id();
  if not found then raise exception 'No profile for this user'; end if;

  select * into w from public.timesheet_weeks
   where id = p_week_id and org_id = v_me.org_id;
  if not found then raise exception 'Timesheet week not found'; end if;

  if w.paid_at is not null then
    raise exception 'This week has already been paid and can no longer be changed';
  end if;

  v_is_lead := public.is_admin_or_executive()
            or v_actor = any (public.timesheet_week_approvers(w.org_id, w.department_id));

  select coalesce(d.name, 'No workstream') into v_dept
    from (select 1) x left join public.departments d on d.id = w.department_id;

  if v_dec = 'lead_approve' then
    if w.status <> 'pending_lead' then
      raise exception 'This week is not waiting on workstream approval';
    end if;
    if w.user_id = v_actor then raise exception 'You cannot approve your own timesheet'; end if;
    if not v_is_lead then raise exception 'Only this workstream''s lead can approve these hours'; end if;

    update public.timesheet_weeks
       set status = 'pending_md', lead_approved_by = v_actor, lead_approved_at = now(),
           rejected_by = null, rejected_at = null, rejection_comment = null
     where id = w.id returning * into v_row;

  elsif v_dec = 'md_approve' then
    if w.status <> 'pending_md' then
      raise exception 'This week is not waiting on managing director approval';
    end if;
    if w.user_id = v_actor then raise exception 'You cannot approve your own timesheet'; end if;
    if not public.is_admin_or_executive() then
      raise exception 'Only the managing director can give final approval';
    end if;

    update public.timesheet_weeks
       set status = 'approved', md_approved_by = v_actor, md_approved_at = now()
     where id = w.id returning * into v_row;

  elsif v_dec = 'reject' then
    if w.status not in ('pending_lead', 'pending_md', 'approved') then
      raise exception 'Only a submitted week can be sent back';
    end if;
    if not v_is_lead then raise exception 'You are not authorized to review this week'; end if;
    if v_comment is null then
      raise exception 'Say what needs fixing — a comment is required when sending a week back';
    end if;

    update public.timesheet_weeks
       set status = 'rejected', rejected_by = v_actor, rejected_at = now(),
           rejection_comment = v_comment, submitted_at = null,
           lead_approved_by = null, lead_approved_at = null,
           md_approved_by = null, md_approved_at = null
     where id = w.id returning * into v_row;

  elsif v_dec = 'resubmit' then
    if w.status <> 'rejected' then raise exception 'Only a returned week can be resubmitted'; end if;
    if w.user_id <> v_actor and not public.is_admin_or_executive() then
      raise exception 'Only the person whose week this is can resubmit it';
    end if;

    update public.timesheet_weeks
       set status = 'pending_lead', submitted_at = now(),
           rejected_by = null, rejected_at = null, rejection_comment = null
     where id = w.id returning * into v_row;

  elsif v_dec = 'reopen' then
    if not public.is_admin_or_executive() then
      raise exception 'Only an admin or executive can reopen an approved week';
    end if;
    if w.status <> 'approved' then raise exception 'Only an approved week can be reopened'; end if;

    update public.timesheet_weeks
       set status = 'pending_lead', submitted_at = now(),
           lead_approved_by = null, lead_approved_at = null,
           md_approved_by = null, md_approved_at = null
     where id = w.id returning * into v_row;

  else
    raise exception 'Unknown decision: %', p_decision;
  end if;

  insert into public.timesheet_week_reviews (org_id, timesheet_week_id, actor_id, decision, comment)
  values (v_me.org_id, w.id, v_actor, v_dec, v_comment);

  -- Who hears about it: forward steps ping the next approver, anything that
  -- lands back on the person pings the person.
  if v_dec in ('lead_approve') then
    for u in select pr.user_id from public.profiles pr
              where pr.org_id = w.org_id and pr.is_active and pr.role in ('admin','executive')
    loop
      insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
      select w.org_id, u, 'timesheet_submitted',
             pr.full_name || ' — week of ' || to_char(w.week_start, 'Mon DD'),
             v_dept || ' · approved by ' || v_me.full_name || ', awaiting final sign-off',
             'timesheet_week', w.id
        from public.profiles pr where pr.user_id = w.user_id and pr.org_id = w.org_id;
    end loop;

  elsif v_dec in ('resubmit') then
    foreach u in array public.timesheet_week_approvers(w.org_id, w.department_id) loop
      insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
      select w.org_id, u, 'timesheet_submitted',
             pr.full_name || ' — week of ' || to_char(w.week_start, 'Mon DD') || ' (resubmitted)',
             v_dept || ' · awaiting your approval',
             'timesheet_week', w.id
        from public.profiles pr where pr.user_id = w.user_id and pr.org_id = w.org_id;
    end loop;

  else
    v_label := case v_dec
      when 'md_approve' then 'Approved: week of ' || to_char(w.week_start, 'Mon DD')
      when 'reject'     then 'Sent back: week of ' || to_char(w.week_start, 'Mon DD')
      when 'reopen'     then 'Reopened: week of ' || to_char(w.week_start, 'Mon DD')
      end;
    insert into public.notifications (org_id, user_id, type, title, body, entity_type, entity_id)
    values (w.org_id, w.user_id, 'timesheet_decided', v_label,
            v_dept || ' · ' || coalesce(v_comment, 'by ' || v_me.full_name),
            'timesheet_week', w.id);
  end if;

  return v_row;
end $$;
