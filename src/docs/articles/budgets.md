---
title: Budgets and hour allocation
section: Approvals and money
order: 20
roles: finance
summary: How a project budget becomes monthly plans, workstream pots, and hours on a task.
---

Money in KofaOS narrows in four steps: a project budget, split by month, allocated to workstreams, then committed as hours against a person. Each step has its own screen, and each one is capped by the step above it.

```
Project budget
└── Month           the budget split across the project's length
    └── Workstream  a slice of that month for one team
        └── Hours   what a person is committed to spend, costed at their pay rate
```

## Project budget

Set when the project is created. It splits evenly across the project's length in months from the start date, and you adjust it afterwards on the project's **Budget** tab.

## Monthly budgets

The Budget tab lists a row per month — **Month**, **Amount**, **Allocated**, **Status** — with a running check above it: "{planned} of {total} planned", plus "{amount} unallocated" or "{amount} over" when they disagree.

Months start as **Draft**. An admin or executive presses **Approve** to fix one, and can **Reopen** an approved month while it is still in the future. **Split evenly** and **Save changes** work the whole schedule at once.

![The monthly budget table](/docs/img/budgets-monthly.png)

> [!WARNING] Past months are final
> Once a month has ended, its row shows a **Locked** chip: "This month has ended and can no longer be reopened." Allocations inside it are locked too, and a budget request against it can no longer be approved — it shows **Past month**.
>
> This is deliberate: a closed month has already been paid against. Plan a month before it starts, not after.

## Workstream allocations

**Allocate** on a month row opens that month's split. Each workstream gets an amount, with "committed {amount} · remaining {amount}" beside it so you can see what has already been spoken for. Add one with **Add a workstream…**, remove with **Remove**, then **Save allocation**.

The footer totals against the month's cap and refuses to save over it. A month cannot allocate more than it holds.

## Hours on a task

The last step, on the task itself, in **Hour allocations**. It works one month at a time and shows the workstream's position for that month: "{workstream} · {committed} committed of {allocated} allocated · {remaining} remaining".

Add a person and their hours. Only members of the task's workstream are offered.

Two things worth knowing:

- **This is also how a task gets assigned.** Giving someone hours makes them an assignee. There is no separate assignee picker.
- **Hours cost at the person's pay rate**, not the rate charged to the client. A person with no rate on file shows "no rate on file" instead of a figure.

If the task has no workstream, the panel says: "Assign this task to a workstream to budget hours against it."

## Budget requests

Committing more hours than the workstream has left does not block you — it opens a request. The panel explains itself ("That would exceed the remaining {workstream} budget for {month}.") and asks for an amount and a reason.

Requests collect under **Budget requests** on the project's Budget tab as **Pending**, **Approved** or **Denied**, and an admin or executive decides them. A lead can raise one directly with **Request more budget for this workstream**.

> [!NOTE] Requests are a conversation, not a formality
> The reason field is what the approver reads. "Client added two more variants" gets approved; a bare number gets a question back.

## Who sees any of this

The monthly planner, allocations and requests are leadership-only. Anyone without financial access sees the Budget tab's charts and this line instead: "Rates, monthly budgets, and margin are restricted to leadership. Hours are shown in full."

Hours are never hidden from anyone. Money is.
