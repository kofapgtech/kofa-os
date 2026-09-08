---
title: Projects
section: Daily work
order: 20
roles: all
summary: Every project you can reach, with budget health at a glance.
---

A grid of cards, one per project. The page subtitle changes with what you are allowed to see: "Budget health across every account." if you see money, "Hours logged against every active engagement." if you do not.

![The Projects grid](/docs/img/projects-grid.png)

## Reading a tile

Each card carries the project name, its account, and a status chip. Below that comes either a **burn bar** — how much of the budget is consumed — or an **Internal · no budget** chip for projects that do not track one.

Three figures across the bottom:

- **Hours logged**
- **Spend** (or **Internal cost** on an untracked project) — this reads `—` if your role does not include money
- **Length** — "3 mos", or **Open-ended**

If a project is heading past its budget at the current rate, a red banner appears on the tile: "Projected {amount} at current burn — {amount} over."

The dropdown at the top filters by status and starts on **All statuses**.

> [!ROLE] Admins and executives
> The **New project** button and the pencil icon on each tile are theirs. Everyone else gets a read-only grid.

## Statuses

**Planning**, **Active**, **On hold**, **Completed**, **Archived** — in that order. New projects start at Planning.

Nothing is deleted. Archiving a project keeps its logged hours, invoices and payment history, and you can bring it back by setting the status again.

## Creating one

**New project** opens a form:

| Field | Notes |
| --- | --- |
| Account | Required |
| Name | Required |
| Code | Optional |
| Status | Defaults to Planning |
| Start date | Drives the monthly budget split |
| Length (months) | Preset chips for 1, 2, 3, 6 and 12 months |
| Budget amount | Required on client projects |

The budget splits evenly across the length in months from the start date. You adjust that split afterwards on the project's Budget tab — see [Budgets and hour allocation](/docs/budgets).

> [!NOTE] Only internal projects can go without
> A project on the internal account can tick off both the budget and the length, and then runs open-ended with no burn bar or threshold alerts — hours and internal cost instead. Client projects always carry a budget and an end date.

Once created, click any tile to open it: [Inside a project](/docs/inside-a-project).
