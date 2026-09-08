---
title: How work is structured
section: Core concepts
order: 10
roles: all
summary: Workspace, account, project, task, workstream, deliverable — and how they fit together.
---

Six words do most of the work in KofaOS. Learn them once and every screen makes sense.

## The shape of it

```
Workspace
└── Account            a client (or the agency itself)
    └── Project        a piece of work with a budget and a length
        └── Task       something someone actually does
            ├── time entries      hours logged against the task
            └── deliverables      what gets sent for review
```

Sitting across that tree, not inside it, is the **workstream** — a company-wide team. A task belongs to a project *and* to a workstream, which is what decides who picks it up.

## Workspace

The whole company's data, sealed off from every other workspace. Everything below lives inside one, and the workspace also holds your currency, time zone, week start and pay-period cadence — see [Workspace settings](/docs/workspace-settings).

Most people only ever belong to one. If you belong to several, the workspace name in the top-left is a menu you can switch with.

## Account

A client. Accounts carry a status — **Prospect**, **Active**, **Paused** or **Closed** — a contact name and email, and the read-only [client portal link](/docs/client-portal).

Every workspace also keeps exactly one **internal account**: the agency's own work. It is pinned to the top of the Accounts list, has no portal link, and cannot be deleted. It is the only account whose projects are allowed to run without a budget or an end date.

## Project

A piece of work for an account, with a **budget**, a **start date** and a **length in months**. The budget splits evenly across those months when the project is created, and you adjust the split afterwards on the project's Budget tab.

Statuses are **Planning**, **Active**, **On hold**, **Completed** and **Archived**. Projects are archived rather than deleted, so the hours and payment history behind them survive.

Internal projects can opt out of both budget and end date, and then show **Internal · no budget** instead of a burn bar.

## Task

The unit of actual work: a title, a status, a priority, a due date, an estimate, a description — and a **workstream**. Statuses run **To do → In progress → Blocked → In review → Done**; priorities are low, medium, high and urgent.

Two things about tasks surprise people:

- **A task belongs to a workstream, not to a person you pick from a list.** You do not assign a task directly. Someone is put on it by giving them hours against the workstream's budget for that month — that is what makes them an assignee. [Inside a project](/docs/inside-a-project) covers how.
- **Done locks a task.** Once the status is Done, the title, priority, due date, workstream, description and subtasks are all frozen. The status itself stays editable, which is how you undo it.

## Workstream

A company-wide team — Studio, PPC and so on. Tasks route to a workstream, and its lead staffs them from there, so work does not depend on remembering which individual is free.

A workstream has **members** (anyone can be on more than one) and one or more **leads** (one person can lead several). It also holds a monthly **budget allocation** per project, which is the pool that hours get committed against. See [Admin: workstreams](/docs/admin-workstreams) and [Budgets and hour allocation](/docs/budgets).

> [!NOTE] Workstream, not department
> The database still calls these "departments" in places, and you may see the older word in a URL. They are the same thing.

## Deliverable

The thing you actually hand over: a design, a report, a set of assets. A deliverable belongs to a project, optionally links to a task, and moves through **Draft → Internal review → Client review → Approved**, with **Revisions requested** as the branch back. It carries attachments, comments and a version number. See [Deliverables](/docs/deliverables).

## How the pieces connect

Reading it as a sentence: *a **task** on a **project** for an **account** is routed to a **workstream**, whose lead commits **hours** from that workstream's monthly budget to a person, who logs **time** against the task and produces a **deliverable** that goes to the client for approval.*

Every screen in the app is a view of one slice of that sentence.
