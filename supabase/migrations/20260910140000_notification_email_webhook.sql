-- Wires notifications to email. Supersedes 13_enable_email_webhook.sql, which
-- was never applied and carried a <WEBHOOK_SECRET> placeholder in the file.
--
-- BEFORE APPLYING, set the shared secret in Vault (never in this file):
--
--   select vault.create_secret('<a long random string>', 'notification_webhook_secret');
--
-- and set the same value as WEBHOOK_SECRET in
-- Supabase -> Edge Functions -> send-notification-email -> Secrets, alongside
-- RESEND_API_KEY, NOTIFICATION_FROM, APP_URL and EMAIL_ENABLED.
--
-- If the Vault secret is missing the trigger simply does not call out, so
-- applying this early is harmless -- notifications keep working in-app.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_email_webhook()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_secret text;
begin
  -- Read the secret from Vault rather than baking it into the migration, so
  -- rotating it is a Vault update and never a schema change.
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'notification_webhook_secret';

  if v_secret is null then
    return new;                      -- not configured yet: in-app only
  end if;

  -- Fire and forget. pg_net is asynchronous, so a slow or failing mail
  -- provider can never slow down or roll back the transaction that created
  -- the notification.
  --
  -- Every notification is posted, not just the emailable ones: the decision
  -- about which types deserve an email lives in EMAILABLE inside the Edge
  -- Function, and keeping it in exactly one place is worth more than the
  -- handful of no-op invocations it costs. Add a `when (new.type in (...))`
  -- clause below if that volume ever becomes worth optimising.
  perform extensions.net_http_post(
    url     := 'https://rhuwwmcmfmqgudcwzdyu.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', v_secret
               ),
    body    := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end $function$;

revoke execute on function public.notify_email_webhook() from public, anon, authenticated;

drop trigger if exists notify_email_webhook on public.notifications;
create trigger notify_email_webhook
  after insert on public.notifications
  for each row execute function public.notify_email_webhook();

-- To mute email later without dropping anything:
--   alter table public.notifications disable trigger notify_email_webhook;
-- or set EMAIL_ENABLED=false on the Edge Function.
