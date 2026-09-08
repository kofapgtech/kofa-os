---
title: Inside a project
section: Daily work
order: 30
roles: all
summary: The project page — tasks, time, deliverables and budget in one place.
---

Open a project from the [Projects](/docs/projects) grid. **All projects** at the top left takes you back.

## The header

The project name, and under it the account, the start date, and either the target end date and length or "open-ended". To the right sits the status chip and, for admins and executives, a pencil to edit the project.

## The numbers

A row of cards, and which ones you get depends on whether the project tracks a budget.

**Tracked:** Hours logged · Spend to date · Remaining · Projected at this burn. Remaining turns red when negative, and the projection reads "On track" or "{amount} over budget". A burn bar sits underneath.

**Untracked (internal):** Hours logged · Internal cost · Open tasks.

> [!ROLE] Money is gated
> Without financial access the money cards read `—` with a padlock and the sub-label **Restricted**. Hours are never hidden from anyone. [Roles and what each can see](/docs/roles-and-access) explains who passes.

![A project's header and stat cards](/docs/img/inside-a-project-header.png)

## Tabs

**Tasks**, **Time**, **Deliverables**, and — on tracked projects only — **Budget**. The first three carry counts.

### Tasks

The same List, Board and Calendar views as [My work](/docs/my-work), minus the per-workstream grouping. **New task** is here.

### Time

Every time entry logged against the project.

### Deliverables

Everything being produced for this project, in the same review workflow as the [Deliverables](/docs/deliverables) page.

## Budget

The Budget tab opens with two charts — **Hours burned over time** and **Hours by person** — and then the money.

> [!NOTE] If you do not see the planner
> Without financial access the tab shows only the charts and the line: "Rates, monthly budgets, and margin are restricted to leadership. Hours are shown in full."

### Monthly budget

A row per month: **Month**, **Amount**, **Allocated**, **Status**. Above the table, a running check — "{planned} of {total} planned", plus "{amount} unallocated" or "{amount} over" when the two disagree.

A month is **Draft** until an admin or executive presses **Approve**; approved months can be **Reopen**ed while they are still in the future. **Split evenly** and **Save changes** handle the whole schedule at once.

> [!WARNING] A past month locks for good
> Once a month has ended its row shows a **Locked** chip: "This month has ended and can no longer be reopened." The same applies to allocations inside it and to any outstanding budget request against it. Plan a month before it starts.

### Allocating to workstreams

**Allocate** on a month row opens that month's split across workstreams. Each row shows a workstream, its amount, and "committed {amount} · remaining {amount}", with a **Remove** button. Add one with the **Add a workstream…** picker and **Add**, then **Save allocation**. The footer keeps a total against the month's cap and will not let you save over it.

### Putting someone on a task

This is the step that surprises people, so it is worth stating plainly: **you staff a task by giving someone hours, not by picking them from an assignee list.**

Open a task and find **Hour allocations**. It works a month at a time — arrows step between months — and shows the workstream's position: "{workstream} · {committed} committed of {allocated} allocated · {remaining} remaining".

Add a person and the hours they should spend. Only members of the task's workstream are offered; if there are none you will see "No one in this workstream yet." Adding an allocation is what makes someone an assignee on the task.

If the task has no workstream yet, the panel says so: "Assign this task to a workstream to budget hours against it."

### When there is not enough budget

Going over the workstream's remaining budget does not block you. A panel appears — "That would exceed the remaining {workstream} budget for {month}." — with a request form. Enter an amount and a reason and submit it.

Requests collect in **Budget requests** on the Budget tab as **Pending**, **Approved** or **Denied**. An admin or executive decides them. A request against a month that has already ended cannot be approved: it shows **Past month**.

## Deleting a project

Admins and executives only, and it is gentler than it sounds: "This archives the project. Logged hours, invoices, and payment history are kept, and this can be undone by editing the status back."
