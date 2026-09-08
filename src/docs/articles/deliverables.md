---
title: Deliverables
section: Daily work
order: 40
roles: all
summary: Tracking work products from draft through client review to approved.
---

A deliverable is the thing you hand over — a design, a report, a set of assets. Tasks track the doing; deliverables track the handing over, and who has the ball right now.

The page subtitle puts it well: "Every work product, and exactly who has the ball."

## The board

Five columns, one per stage, each with a count. Cards sit in the column matching their stage.

![The deliverables board](/docs/img/deliverables-board.png)

Above the board, two panels appear when they have something to show:

- **Waiting on you** — deliverables where you are the reviewer, or where you own one that has come back with revisions requested.
- **Due in the next 7 days** — with the due date on each card.

Controls across the top: a search box ("Search title or project…"), a project filter starting at **All projects**, an **Only mine** toggle, and **New deliverable**.

Empty states are honest about which is which — "No deliverables yet." when there are none, "Nothing matches these filters." when you have filtered them away.

## A card at a glance

The title, its stage, the project, the **owner** and **reviewer** as avatars, a paperclip with a count if there are attachments, and a footer reading `v3 · due 12 Sep`. An overdue date that has not been approved yet turns red and bold.

## Creating one

**New deliverable** asks for a **Project** and a **Title** — those two are required — and optionally a description, a **Linked task**, an **Owner**, a **Reviewer** and a **Due date**. The owner defaults to you.

Setting a **Reviewer** early is worth the two seconds: it is what routes the deliverable into someone's "Waiting on you" when you submit it.

## Attachments

Open a deliverable and you get an **Attachments** section that takes both kinds of thing:

- **Add file** — pick one or several at once; they upload and appear in the list.
- **Add a link** — paste a URL for anything living elsewhere, a Figma file or a Drive folder.

There is no limit, and each row has an **X** to remove it — available to the owner, the reviewer, leadership, or whoever added it. Removing a file deletes it from storage too.

## Comments

At the bottom of the panel, under the history. Anyone who can open the deliverable can post one, and you can delete your own. This is the right place for "the logo in the header is the old one" — it stays attached to the work rather than getting lost in chat.

## The review cycle

Stages, in order: **Draft → Internal review → Client review → Approved**, with **Revisions requested** as the way back from any of the review stages.

The buttons live under **Move this forward**:

| From | Button | Goes to |
| --- | --- | --- |
| Draft | **Submit for review** | Internal review |
| Internal review | **Approve & send to client** | Client review |
| Client review | **Record client approval** | Approved |
| Any review stage | **Request changes** | Revisions requested |
| Revisions requested | **Back to draft** | Internal review |

> [!WARNING] You cannot approve your own work
> If you own the deliverable, the approve buttons are disabled with "You cannot approve a deliverable you own", and a note reads "You own this one, so someone else has to approve it." This is enforced in the database, not just hidden in the screen.

**Request changes** requires a comment — the box says "What needs to change? (required)" and the button stays disabled until you write something. That is deliberate: a deliverable sent back without a reason just bounces again.

Every move is recorded in the deliverable's history with who did it and when.

![A deliverable open, with its stage buttons and history](/docs/img/deliverables-panel.png?w=37)

## Clients approving directly

A client with a [portal link](/docs/client-portal) can approve or request changes themselves, without an account. Their decision lands on the deliverable the same way yours does.

## Elsewhere in the app

Deliverables also show up under their **project**, on the Deliverables tab, and on a **task** when one is linked to it — same items, same workflow, just filtered to what you are looking at.

Leadership can delete a deliverable. The confirmation is blunt about it: "This can't be undone."
