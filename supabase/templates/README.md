# Email setup — Kofa OS

Two separate systems send mail, and they need configuring separately.

| | Sends | Configured in |
|---|---|---|
| **Supabase Auth** | Invite, magic link, password reset | Supabase → Authentication (SMTP + templates) |
| **Notifications** | The 7 in-app notifications that block someone | `send-notification-email` Edge Function + a database trigger |

Both go out through **Resend** as `noreply@kofapg.com` once the steps below are done.

---

## 1. DNS — at GoDaddy

`kofapg.com` runs on GoDaddy nameservers (`ns73/ns74.domaincontrol.com`), with
mail on Google Workspace. Resend needs its own records; the exact values come
from **Resend → Domains → Add domain → kofapg.com**, and are region-specific.

You'll add three, in GoDaddy → Domain → DNS → Manage Zones:

| Type | Name (GoDaddy wants the prefix, not the full domain) | Value |
|---|---|---|
| MX | `send` | `feedback-smtp.<region>.amazonses.com`, priority 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey` | the long DKIM key Resend shows you |

> **Your existing mail is not affected.** Resend bounces through the
> `send.kofapg.com` subdomain, so the Google Workspace SPF record on the apex
> (`v=spf1 include:dc-aa8e722993._spfm.kofapg.com ~all`) stays exactly as it is.
> Do not add Resend to it.

Your DMARC record is already `p=quarantine` with **relaxed alignment**
(`adkim=r; aspf=r`), which is what makes the subdomain arrangement pass. No
change needed there either.

Verification is usually minutes, occasionally an hour.

## 2. Resend

1. Create the account, add and verify `kofapg.com`.
2. Create an API key with **Sending access**.
3. Keep it — steps 3 and 4 both use it.

## 3. Supabase Auth — sender and templates

**Authentication → Settings → SMTP Settings**, enable custom SMTP:

```
Host          smtp.resend.com
Port          465
Username      resend
Password      <your Resend API key>
Sender email  noreply@kofapg.com
Sender name   Kofa OS
```

Then **Authentication → Email Templates**, and paste in the matching file from
this folder:

| Template | File |
|---|---|
| Invite user | `invite.html` |
| Magic Link | `magic-link.html` |
| Reset Password | `reset-password.html` |

Subjects worth setting at the same time:

- Invite user — `You've been added to Kofa OS`
- Magic Link — `Your Kofa OS sign-in link`
- Reset Password — `Reset your Kofa OS password`

> The invite template greets by name using `{{ .Data.full_name }}`, which comes
> from the metadata `invite-employee` passes to `inviteUserByEmail`. Check it
> renders on your first test invite — if it comes out blank, drop the greeting
> line rather than shipping "Hi ,".

## 4. Notification emails

**Edge Functions → send-notification-email → Secrets:**

```
RESEND_API_KEY   <your Resend API key>
NOTIFICATION_FROM  Kofa OS <noreply@kofapg.com>
APP_URL          https://kofaos.netlify.app
WEBHOOK_SECRET   <a long random string>
EMAIL_ENABLED    true
```

Optionally `NOTIFICATION_REPLY_TO` if replies should reach a real inbox.

Store the same secret in Vault, so the trigger can authenticate without the
value ever living in the repo:

```sql
select vault.create_secret('<the same long random string>', 'notification_webhook_secret');
```

Then deploy and apply:

```bash
npx supabase functions deploy send-notification-email
npx supabase db push          # applies 20260910140000_notification_email_webhook.sql
```

Order doesn't matter much — with no Vault secret the trigger does nothing, and
with `EMAIL_ENABLED=false` the function does nothing. Both fail soft, so
notifications keep working in-app throughout.

## Which notifications email

Only the ones where someone is waiting on you:

`timesheet_submitted` · `timesheet_decided` · `deliverable_review` ·
`time_extension_requested` · `department_task_assigned` · `ticket_submitted` ·
`ticket_reply`

Everything else stays in the bell. **`task_assigned` is deliberately excluded** —
it is by far the most common notification, and emailing all of them would train
everyone to filter Kofa OS into a folder they never open, taking the seven above
with it.

The list is `EMAILABLE` at the top of
`supabase/functions/send-notification-email/index.ts`. It is the only place it
lives; the trigger posts every notification and the function decides.

## Testing

1. Invite a test address → checks Auth SMTP, the sender and the invite template.
2. Have someone submit a timesheet week → checks the trigger, the webhook secret
   and the notification template.
3. Assign a task → should send **nothing**. If it emails, `EMAILABLE` isn't
   being honoured.

Function logs are in Supabase → Edge Functions → send-notification-email → Logs.
Every skip says why (`type X is in-app only`, `no active recipient`,
`email disabled`).
