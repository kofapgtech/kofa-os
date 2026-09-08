---
title: Timesheet approvals
section: Approvals and money
order: 10
roles: timesheet-approvals
summary: The lead → managing director → finance chain that clears a week for payment.
---

Contractor weeks reach payroll through a fixed chain, and this page is where you take your turn in it. The page says it in one line: "Contractor weeks are submitted automatically once the week ends, confirmed by the workstream lead, then cleared by the managing director before finance can pay them."

## Who does what

1. **The workstream lead** confirms the hours their people logged. They are the only ones close enough to know whether Thursday's nine hours are real.
2. **The managing director** — an admin or executive — clears the week for payroll.
3. **Finance** pays it, from [Payroll: payment](/docs/payroll-payment).

Nobody reviews their own week, ever.

If you land here without a part to play, the page tells you: "Timesheet approvals are for workstream leads, the managing director and finance."

## The queues

Three sections, and the second and third only appear when they have something in them:

- **Waiting on you** — your queue. Empty reads "Nothing to approve right now."
- **Sent back — waiting on the person** — weeks you have returned, sitting with their owner.
- **Cleared for payroll** — recently approved, most recent 25.

Each row shows the person, the week, the workstream, the hours, and the stage. Cost only appears if your role includes money.

![The approvals queues](/docs/img/timesheet-approvals-queues.png)

## Reviewing a week

Click a row to open it. You get every entry — day, what it was against, hours — plus the week's history of past decisions. Read the entries, not just the total; the total is rarely where the problem is.

Then one of:

- **Confirm hours** — the lead's approval. Sends it to the managing director.
- **Approve for payroll** — the managing director's. Clears it for finance.
- **Send back** — reveals a comment box, then **Send it back**.
- **Reopen** — admins and executives only, on an approved week that has not been paid.

> [!WARNING] Sending back needs a reason
> The comment is required — the button stays disabled until you write one, and the database enforces it too. The box even suggests the shape of a useful note: "e.g. Thursday's 9h looks like a stopped-late timer — please split it."
>
> A week returned with no explanation just comes back unchanged.

Sending a week back unlocks its entries so the person can fix them and resubmit.

## It updates live

The queues are subscribed to changes. When a lead confirms a week, it moves onto the managing director's screen without anyone reloading. Two people working the queue at once will not collide.

## What approval does not do

Approving a week clears it for payment; it does not pay anything. Until someone records a payment on the Payment page the week is approved and unpaid.

The link runs the other way too, and it is a hard stop: an unapproved week **blocks** payment for that person. Finance sees "Not approved yet — this time can't be paid." with each blocking week listed. That guard lives in the database, so it cannot be clicked past.
