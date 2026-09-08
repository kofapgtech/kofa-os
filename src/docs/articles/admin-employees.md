---
title: "Admin: employees"
section: Administration
order: 20
roles: admin
summary: The roster — inviting people, roles, rates, workstreams and files.
---

The roster: "Invite employees and manage the roster." Admins, executives and HR.

## The table

**Name**, **Title**, **Email**, **Role**, **Type**, **Department**, **Capacity**, **Status**. Every column sorts. Status is **Active**, **Inactive** or **Terminated**, and inactive rows are dimmed.

![The employee roster](/docs/img/admin-employees-roster.png)

## Inviting someone

**Invite employee** opens the form. **Full name** and **Work email** are the only required fields, but filling in the rest saves a second pass:

| Field | Why it matters |
| --- | --- |
| Role | Decides everything they can see — [Roles and what each can see](/docs/roles-and-access) |
| Employment type | Employee or contractor. Contractors go through timesheet approval; employees do not |
| Department | Their workstream. Without one they will not appear in hour-allocation pickers |
| Title | Shows next to their name everywhere |
| Capacity (h/wk) | Defaults to 40; drives utilization on the [Command centre](/docs/command-centre) |

**Send invite** emails them a real invitation. Their profile is built from what you entered when they first sign in.

> [!NOTE] Set a pay rate before they log time
> The rate lives on the **Details** tab after the invite, not in the invite form. Hours logged by someone with no rate show "no rate on file" rather than a cost, and their budget figures read as zero until it is filled in.

## Editing a person

Click a row. Up to three tabs:

**Details** — full name, title, role, employment type, department, capacity, and **Rate ($/h)** for admins and HR. Email is never editable. **Save changes**.

**Attachments** — contracts, signed documents, anything belonging to that person. **Add file** to upload; the X removes one permanently ("This removes the file permanently.").

**Settings** — where someone is deactivated. Untick **Active**, or set a **Termination date**, which unticks it for you. There is also **Last day worked**, an optional **Termination reason**, and **Rehire eligible** (Unknown / Yes / No).

> [!WARNING] Deactivate, do not delete
> There is no delete. Deactivating removes their access while keeping their logged hours, timesheets and payment history intact — which is exactly what you want when someone asks about last year's numbers.

## Who can do all this

**Admins, executives and HR**, and all three have the same powers here: edit anyone on the roster, set any role, invite anyone. There are no locked rows and no capped role lists.

That includes editing each other, and it includes changing your own role — so an HR or executive account can make itself an admin. That is deliberate: these are the three roles that administer people, and the workspace is small enough that splitting the job produced more friction than protection.

> [!WARNING] It is the roster, not everything
> This does not make Staff or a Workstream lead able to edit anyone, including themselves. Nobody below these three roles can change an administrative field on any profile — their own included. That boundary is enforced in the database and cannot be clicked past.

## Role labels

**Admin**, **Executive**, **Department lead**, **HR**, **Staff**.

Billing/Finance was merged into HR and is no longer assignable. If you find it offered anywhere, it is a leftover — do not use it.
