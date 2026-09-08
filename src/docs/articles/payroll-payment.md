---
title: "Payroll: payment"
section: Approvals and money
order: 30
roles: payroll
summary: Reviewing a pay period and recording what was paid.
---

Where a pay period gets reviewed, person by person, and payments get recorded.

> [!NOTE] This records, it does not transfer
> Recording a payment here is bookkeeping. The money itself still moves through your normal payout route. What this gives you is one place where hours, approvals and what was actually paid line up.

## Choosing a period

The **Time period** dropdown lists pay periods as date ranges and opens on the current one. Periods are generated automatically from the cadence set in [Workspace settings](/docs/workspace-settings) — weekly, fortnightly, twice a month, or monthly — so there is nothing to create by hand.

Above the tables, a summary: the total across everyone with hours in the period.

## The two tables

**Employees** — **Employee**, **Hours**, **Amount to pay**. A row can also carry a **Paid** chip or an **Awaiting approval** chip.

**Projects** — **Project**, **Hours**, **Amount spent**. The same period seen from the client's side rather than the payee's.

Amounts are hours costed at each person's **pay rate**, not the rate billed to a client. Those are different numbers and this page always uses the first.

![A pay period, by employee and by project](/docs/img/payroll-payment-period.png)

## Recording a payment

Click a person's row to open their invoice: a line per project, hours logged, amount, and **Total for this pay period**. **Print invoice** hands it to your browser's print dialog if you need a copy.

If the row is payable, **Pay now** records it. There is no second confirmation, so read the total before you click.

## What stops a payment

Two guards, both enforced in the database rather than merely hidden on screen.

**The period has not ended.** The button is replaced by "Available once this period ends ({end date})". You cannot pay a period that is still accruing hours.

**Someone's time is not approved.** An amber panel reads "Not approved yet — this time can't be paid.", and lists each blocking week with its workstream and stage. Contractor weeks have to travel the full chain — workstream lead, then managing director — before finance can pay them. See [Timesheet approvals](/docs/timesheet-approvals).

If a week is stuck, the fix is upstream: find whose queue it is sitting in and clear it there. Nothing on this page can override it.

Once paid, the row shows **Paid {date} · {amount}** and the payment appears in [Records](/docs/payroll-records).

> [!ROLE] Admins and HR
> Payroll is deliberately narrower than the rest of the money gate. Workstream leads and executives can see rates and budgets across the business but cannot open Payroll — seeing money and running payroll are two different permissions. Without it: "No payroll access."
