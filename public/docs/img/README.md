# Docs screenshots

Drop PNGs in this folder using the exact filenames below. Each one is already
referenced from its article, so a file appears in the docs the moment it lands —
no edit to any article needed. A filename that isn't here yet simply shows
nothing; the renderer hides a missing image rather than leaving a broken icon.

The 19 shots that exist were captured at 1440 wide, 2x, cropped to where each
screen's content ends. If you retake one by hand, match that.

## How to take them

- **Browser width 1440**, zoom 100%, and capture the content area — not the
  whole desktop, and not the browser chrome.
- **Sign in as an admin** for anything under Administration, Approvals or
  Payroll; those screens don't exist for other roles.
- **Have real-looking data on screen.** An empty state teaches nothing. A
  screen with three or four rows on it teaches the layout in one glance.
- **Watch what's in frame.** These are visible to everyone signed in, so avoid
  capturing pay rates, payment amounts or anything about a named individual you
  wouldn't put on a noticeboard. The Payroll shots below are deliberately framed
  to show structure rather than figures — blur or crop the amounts.
- Save as PNG, keep the file under about 400 KB.

## Still outstanding

Two shots are missing, and it is not an oversight:

- `payroll-payment-period.png`
- `payroll-records-table.png`

**Payroll cannot be reached by any demo account on the deployed build.** That
build still gates Payroll on `isPayrollAdmin = admin || billing_finance`, and
`billing_finance` is a role the database now rejects — so HR gets "No payroll
access" and the only accounts that can open it (admin@ and tech@) are not demo
logins. Deploy the `AuthContext` fix that puts `hr_manager` back in that test
and the HR demo account can reach it; then these two can be captured like the
rest. Blur or crop the amounts when you do — they are real people's pay, and
these docs are readable by anyone signed in.

## The shot list

| Filename | Screen | What should be on screen |
| --- | --- | --- |
| `getting-started-sign-in.png` | `/login` | The sign-in card with all three options visible |
| `getting-started-shell.png` | `/` | Whole layout: green header, sidebar, My work behind it |
| `my-work-overview.png` | `/` | The four stat cards and the workstream task tree below |
| `my-work-task-drawer.png` | `/` → click a task | Task drawer open, on a task that is *not* Done |
| `projects-grid.png` | `/projects` | Several tiles, at least one with a burn bar |
| `inside-a-project-header.png` | a project | Header plus the stat card row, on a budget-tracked project |
| `budgets-monthly.png` | project → Budget | The monthly table with a mix of Draft and Approved rows |
| `deliverables-board.png` | `/deliverables` | The board with cards in more than one column |
| `deliverables-panel.png` | a deliverable | Detail panel: stage buttons, attachments, history |
| `timesheet-week.png` | `/timesheet` | A week with entries across several days |
| `timesheet-approvals-queues.png` | `/timesheet/approvals` | "Waiting on you" with rows in it |
| `payroll-payment-period.png` | `/payroll/payment` | Employee and project tables — crop or blur amounts |
| `payroll-records-table.png` | `/payroll/records` | A few recorded payments — crop or blur amounts |
| `accounts-list.png` | `/accounts` | Two or three accounts including the internal one |
| `client-portal-view.png` | `/portal/<token>` | The client's view with a deliverable awaiting approval |
| `command-centre-overview.png` | `/command` | Stat cards and the utilization chart |
| `admin-employees-roster.png` | `/admin/employees` | The roster table with several people |
| `admin-workstreams-list.png` | `/admin/workstreams` | The list showing members and leads |
| `workspace-settings-general.png` | `/settings` | Identity and Locale sections — not the danger zone |
| `profile-page.png` | `/profile` | A filled-in profile with a photo |
| `notifications-bell.png` | any screen | The bell dropdown open with a few unread items |

## Naming new ones

`<article-slug>-<what-it-shows>.png`. Reference it from the article as
`![Alt text becomes the caption](/docs/img/your-file.png)`.

## Sizing a figure

An image fills the article column by default, which is right for a whole
screen and far too big for a tall narrow one. Append `?w=<percent>` to scale it
down and centre it:

```
![The task drawer](/docs/img/my-work-task-drawer.png?w=67)
```

The hint never reaches the `src`, so the file is still requested by its real
name. The three panel shots — the task drawer, the deliverable panel and the
notification dropdown — use `?w=67`, and their PNGs are stored at two-thirds
size to match.
