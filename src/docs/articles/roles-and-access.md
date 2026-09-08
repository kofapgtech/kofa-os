---
title: Roles and what each can see
section: Core concepts
order: 20
roles: all
summary: The five roles, the two things that sit alongside them, and exactly which screens each one gets.
---

Every person in a workspace holds exactly one **role**. The role is the single thing that decides which screens appear in your sidebar, whose work you can act on, and whether you see money.

Two things sit *alongside* the role and are often confused with it:

- **Owner** is a flag, not a role. One person per workspace holds it, and it grants Workspace settings and the ability to hand ownership on. An owner is usually an admin as well, but the two are set separately.
- **Employee or contractor** is mostly a description of how someone is engaged rather than a permission — but it does two things. A contractor's timesheet weeks go through [approval](/docs/timesheet-approvals), and a contractor does not get the **Accounts** screen, or the full project list, whatever role they hold: they are staffed onto projects, not onto the client relationship.

> [!NOTE] If a screen isn't in your sidebar, you don't have it
> KofaOS hides what you can't use rather than showing it greyed out. The same rule applies to these docs: articles about screens your role can't reach are filtered out of the list, which is why your colleague's sidebar may be longer than yours.

## The five roles

### Staff

The default. Sees their own work and the projects they're on: **My work**, **Projects**, **Deliverables**, **Timesheet**, **Accounts**. Logs their own hours, moves their own tasks, comments on deliverables.

Staff do not see money. Rates, costs, accrued spend and budget figures show as `—` with a padlock wherever they'd otherwise appear.

### Workstream lead

Everything Staff has, plus:

- **Command centre** — capacity, budget health and what's stuck across the business
- **Timesheet → Approvals** — confirms the weeks logged by people in the workstream they lead
- **Money** — sees rates, costs and budget figures everywhere they appear

A lead's authority is scoped to their workstream for approvals, but their *visibility* is company-wide. One person can lead more than one workstream.

### HR

Everything Staff has, plus:

- **Admin**, narrowed to the roster — inviting people, editing details, rates, workstream membership and attachments
- **Payroll** — reviewing a pay period and recording what was paid
- **Money** — sees rates, costs and budget figures everywhere they appear

HR also manages workstreams — creating, renaming, deleting and staffing them — alongside admins and executives. HR does not get Command centre.

> [!WARNING] Billing/Finance no longer exists
> Billing/Finance was merged into HR. The database rejects the old role outright, so anyone who held it is now HR. If you still see "Billing/Finance" offered anywhere in the app, it is a leftover — don't assign it.

### Executive

Everything a Workstream lead has, plus the full **Admin** section including **Workstreams**. In practice an executive can do everything an admin can except create, invite or delete a user identity — and except Payroll, which is HR and admins only.

### Admin

The full app. Everything above, plus inviting and removing people, and every administrative screen. If something in this guide says "ask an admin", this is who it means.

## What each role sees

| Screen | Staff | Workstream lead | HR | Executive | Admin |
| --- | --- | --- | --- | --- | --- |
| My work | Yes | Yes | Yes | Yes | Yes |
| Projects | Yes | Yes | Yes | Yes | Yes |
| Deliverables | Yes | Yes | Yes | Yes | Yes |
| Accounts | Yes* | Yes* | Yes* | Yes* | Yes* |
| My timesheet | Yes | Yes | Yes | Yes | Yes |
| Command centre | — | Yes | — | Yes | Yes |
| Timesheet → Approvals | — | Yes | — | Yes | Yes |
| Payroll | — | — | Yes | — | Yes |
| Admin → Employees | — | — | Yes | Yes | Yes |
| Admin → Workstreams | — | — | Yes | Yes | Yes |
| Workspace settings | Owner only | Owner only | Owner only | Owner only | Owner only |
| Money: rates, costs, budgets | — | Yes | Yes | Yes | Yes |
| Submit a ticket | Yes | Yes | Yes | Yes | Yes |
| Manage tickets | — | — | — | — | Yes |

\* Not for contractors, whatever their role.

> [!TIP] HR is a sideways step, not a rung
> Staff, Workstream lead, Executive and Admin stack — each has everything the one before it had. HR doesn't sit on that ladder: it trades Command centre away for the roster, workstream management and Payroll. An executive outranks HR nearly everywhere and still can't open Payroll.

## Changing someone's role

An admin does it from **Admin → Employees**: open the person, change Role, save. It takes effect the next time they load the app.

> [!ROLE] Admins only
> Executives can edit most things about a person but cannot create or delete the underlying login.

## Why you might see less than a colleague

Three different things can be at play, and it's worth telling them apart before raising it:

1. **Role** — the sidebar itself is shorter. Covered by the table above.
2. **Money visibility** — the screen is there but figures read `—` with a padlock. That's the financial gate, which leads, HR, executives and admins pass and Staff does not.
3. **Scope** — you have the screen and the figures, but you're seeing fewer rows because the records themselves belong to someone else's workstream or project.

A fourth applies only to contractors: **Accounts** and the wider project list are closed to them whatever their role.

If none of those explains it, that's worth reporting — see [Getting help](/docs/getting-help) and [Tickets](/docs/tickets).
