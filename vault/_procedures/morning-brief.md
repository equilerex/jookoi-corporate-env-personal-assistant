# Morning brief procedure

How to answer "what's on today?", "morning brief" or "catch me up on today". It is an operational brief built from one call, not a vault review. Task layers and their rules come from `_AI_INSTRUCTIONS.md`.

## Building it

1. Call `vault_get_briefing`. Don't rebuild Today, Waiting, overdue or due-soon by reading the task files.
2. Read an epic, person or team page only when a Today or due-soon item needs its context to be understood (what the blocker on an epic is, what the next step is, who owns the dependency). No broad searches or entity listings.
3. Don't create today's daily note for a brief, and make no other writes.

## What it says

Answer, in this order, and leave out whatever is empty:

- What happens today: `events` starting today (from `calendar/events/`), with times. If you have live calendar access, it is authoritative: use it, and mention a difference from the vault copy. With no synced events and no access, say nothing about the calendar beyond `#calendar` tasks.
- Who is waiting on the owner: PR reviews and sign-offs in `today`. They go first, because they block a colleague.
- What needs attention today: the rest of `today` and `overdue`, placed around the meetings (the demo prep before the 14:00 sprint review).
- What is time-sensitive in the next 7 days: `due_soon`, and tomorrow's `events` when they need preparation today.
- What is blocked: `waiting`, only when something there matters today or is due. Name who it waits on, so the owner can chase it.
- Whether Today is obviously unrealistic (too many items for the time the meetings leave, or a `⏫` item buried among small ones). Say so in one line. Don't fix it unasked.
- Anything else the owner should know before starting: an open question that blocks or changes today's work, or a recent change that alters today's context.

Keep it short. Don't list the Backlog, all open questions, `recent_changes` or task counts just because the briefing returned them, and never narrate MCP activity. Empty sections aren't mentioned.

A `#calendar` task and a calendar event for the same thing are one item: mention it once. A `#calendar` task due today with no matching event is worth one line ("not in the calendar yet") only when calendar events are synced. Don't create or change calendar events from a brief. That follows the Calendar rule, on the owner's request. For events further out, `vault_query_notes(folder="calendar/events", frontmatter_filter={"date": {"$gte": "YYYY-MM-DD", "$lt": "YYYY-MM-DD"}})`, only when the owner asks about them.

`dated_elsewhere` holds dated tasks outside the task files, usually checklists on epic pages. Not planning input. If one is overdue or due today, mention it in one line as possibly misfiled; otherwise ignore it.

## Changing the plan

A brief changes nothing. When the owner asks to change the plan ("make today realistic", "plan my day", "move X to tomorrow"), reorganize with the task tools under the Layers rules: pull in what is due, overdue, blocking a colleague or explicitly urgent, send back what landed in Today or This week by default, never demote what the owner placed there. Don't pull ordinary Backlog tasks into Today unless the owner asks.
