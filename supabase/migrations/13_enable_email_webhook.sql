-- NOT YET APPLIED. Run this only after the Resend secrets are set, otherwise
-- every notification fires a pointless (harmless) HTTP call.
--
-- Prerequisites, set in Supabase → Edge Functions → send-notification-email → Secrets:
--   RESEND_API_KEY     your Resend key
--   NOTIFICATION_FROM  e.g. "Kofa OS <notifications@kofapg.com>"  (domain must be
--                      verified in Resend, otherwise Resend only delivers to
--                      your own address)
--   APP_URL            the deployed Netlify URL, so email buttons link somewhere real
--   WEBHOOK_SECRET     any long random string; must match the value below
--   EMAIL_ENABLED      "true" to send, "false" to mute without redeploying
--
-- Then replace <WEBHOOK_SECRET> below and apply.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_email_webhook()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Fire and forget. pg_net is asynchronous, so a slow or failing mail
  -- provider can never slow down or roll back the transaction that created
  -- the notification.
  perform extensions.net_http_post(
    url     := 'https://rhuwwmcmfmqgudcwzdyu.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', '<WEBHOOK_SECRET>'
               ),
    body    := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end $$;

revoke execute on function public.notify_email_webhook() from public, anon, authenticated;

create trigger notify_email_webhook
  after insert on public.notifications
  for each row execute function public.notify_email_webhook();

-- To mute email later without dropping anything:
--   alter table public.notifications disable trigger notify_email_webhook;
