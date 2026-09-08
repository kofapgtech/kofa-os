---
title: Workspace settings
section: Administration
order: 40
roles: owner
summary: Currency, time zone, pay cadence, sign-in rules, and the destructive tools.
---

The workspace's own settings. **The owner only** — everyone else, admins included, sees "Only the workspace owner can change these settings."

## Identity

**Name**, a **Logo** URL and a **Brand colour**.

The **Address** is fixed: "Fixed — it identifies the workspace, and changing it would break saved links."

## Locale and money

**Currency** (USD, GBP, EUR, CAD, AUD, NGN, ZAR), **Time zone**, **Week starts** (Monday or Sunday), and **Default capacity (h/week)**.

> [!WARNING] Currency changes the symbol, not the amounts
> "Changes the symbol on every rate, budget and payroll figure. It does not convert any stored amount — the numbers stay exactly as they are." Switching from USD to GBP will relabel £ against numbers that are still dollars. Convert deliberately if you ever need to.

## Payroll

**Pay period cadence**: **Weekly**, **Every two weeks**, **Twice a month (1st–15th, 16th–end)**, or **Monthly**. This is what generates the periods on [Payroll: payment](/docs/payroll-payment).

Changing it is safe for history: "New periods in this shape are added going forward. Periods that already exist — including any that are locked or paid — are never rewritten or removed."

## Access and ownership

**Sign in without an invite** lists allow-listed email domains. Anyone with an address at one is added to the roster as staff on first sign-in; everyone else needs an invite. With none listed it reads "Invite only — no domains are allow-listed."

**Transfer ownership** hands the workspace to another member: "They become owner and admin. You stay an admin, but lose this page." Exactly one person holds it at a time.

![Workspace settings](/docs/img/workspace-settings-general.png)

## The danger zone

"Destructive, workspace-wide actions — read carefully before confirming." Both require typing the workspace address to confirm.

### Reset workspace

Wipes every account, project, task, time entry, deliverable, budget and payroll record — while leaving your settings and everyone's membership alone. It clears the work, not the workspace.

An optional checkbox, **Also remove every employee**, goes further: every membership except yours and other admins, along with their pay rates, workstream-lead tags and attachments. The workstreams themselves stay.

### Delete workspace

Only offered if you belong to more than one. It stops appearing anywhere and nobody can sign into it.

> [!WARNING] There is a window, and it is not forever
> Neither action purges immediately — a later cleanup step does that. Until then recovery means contacting support, and after it there is nothing to recover. Neither can be undone from this page.

If you want a clean slate for a demo or a fresh start, **Reset** is almost always the one you want, not **Delete**.
