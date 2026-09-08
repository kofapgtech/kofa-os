---
title: My work
section: Daily work
order: 10
roles: all
summary: Your home screen — everything on your plate, grouped by workstream.
---

The first screen after you sign in, and the one to keep open. It greets you by name and tells you what is on your plate this week.

## The top of the page

Four cards summarise where you stand:

- **Hours this week** — with billable hours and your weekly capacity underneath.
- **Open tasks** — how many are assigned to you in total.
- **Overdue** — "Needs attention today", or "Nothing late" if you are clear.
- **Waiting on you** — deliverables sitting in your court to review or revise.

![My work, with the four summary cards and the task tree below](/docs/img/my-work-overview.png)

Below those, sections appear only when they apply: **Deliverables waiting on you**, **Time requests waiting on you**, and — if you lead a workstream — **Tasks waiting for you to staff**, which lists work that has arrived in your workstream with nobody on it yet.

## Your tasks

Under **My tasks**, work is grouped into one card per workstream, and inside each card it nests **Account → Project → Task**. Both levels collapse, so you can fold away a client you are not thinking about.

Three views, switched with the **List**, **Board** and **Calendar** buttons.

### List

A table per workstream: **Task**, **Status**, **Assignee**, **Priority**, **Due**, and **Logged / Est.** Click any column header to sort by it.

The row itself tells you things:

- **Urgent and not done** — a flame icon, a red left border and a pink tint.
- **Overdue** — the due date in bold red.
- **Done** — dimmed to about 60%, and none of the urgent treatment. Finished work should stop shouting.

### Board

Five columns — **To do**, **In progress**, **Blocked**, **In review**, **Done** — each with a count. Drag a card between columns to change its status. On My work the board splits per workstream, same as the list.

### Calendar

A month grid, Monday first, with tasks placed on their due dates. Days showing more than three get a "+N more". Use the arrows to move between months.

## Filters

Two dropdowns above the views: a status filter that starts at **All statuses**, and an assignee filter that starts at **Everyone**. A live count sits beside them. If you filter everything away you get "No tasks match these filters." rather than a blank page.

## Working a task

Click a task to open its drawer.

Editable while the task is open: **title**, **status**, **priority**, **due date**, **workstream** and **description**. There is a **Time logged** section showing logged against estimated hours, a **Subtasks** list, and a **Time requests** section.

Assignees appear as read-only chips. You do not pick them here — someone is added by being given hours against the workstream budget, which is covered in [Inside a project](/docs/inside-a-project).

![The task drawer, open on a task in progress](/docs/img/my-work-task-drawer.png?w=37)

> [!WARNING] A Done task is locked
> Set the status to Done and the banner reads "Done — change the status to make further edits." Title, priority, due date, workstream, description and subtasks all freeze. The **Status** field stays editable on purpose — changing it away from Done is how you reopen the task.


## The timer

The timer lives in the green header, so it follows you across every screen.

Click **Start timer** and a small panel opens titled "Track time". The quickest route is the **Your open tasks** list at the top — click one and the clock starts immediately. Otherwise pick a **Project**, optionally a **Task**, add a note about what you are doing, and press **Start**.

While it runs, the header shows a pulsing dot, a live `H:MM:SS` clock and the task you are on, with a **Stop** button. Stopping writes the entry to your [timesheet](/docs/timesheet).

> [!NOTE] One timer at a time
> Only one can run per person. If you try to start a second, the button reads "A timer is already running" — stop the first one. The timer also survives a page reload, so closing the tab by accident does not lose your afternoon.

## Asking for more time

If a task needs more hours than its estimate, open it and use **Request more time**. Enter the hours and a reason, then **Submit request**.

Someone else decides it — you cannot approve your own — with **Approve** or **Deny**. An approved request raises the task's estimate. Requests waiting on you appear at the top of My work.
