# Weekly review procedure

How to close out a week with the owner's own recap, the vault's record of what changed, and one clean weekly account. Routing, task layers, provenance and formats come from the vault rules and `procedure:triage`. The interaction model mirrors `procedure:daily-close`: gather enough context to prompt well, ask the owner, then combine their account with the evidence and do the housekeeping.

A Weekly Review is neither a silent scrape nor a blank "how was your week?". The agent first gathers enough to remind the owner what the week contained, then presents a shaped recap prompt. The owner supplies what only they know: how the week actually went, what mattered, what the records miss, and what should matter next. Only after that answer does the agent produce the report and reconcile the task system.

## Which week

Use the week the owner names. Otherwise review the current Monday-through-Sunday week. If the intended week is genuinely unclear near a boundary, ask which week before gathering.

The evidence window is Monday through the following Monday as an exclusive upper bound.

## Gather before asking

Gather context first so the reminder is specific:

1. Read `Todo.md`, `Backlog.md` and `Follow-ups.md`. Include completed and moved work where visible, not only what remains open.
2. Read `Journal/YYYY-MM-DD.md` and `lists/journal/daily/YYYY-MM-DD.md` for the week when they exist. Prefer the clean daily accounts for narrative and use raw journals to fill gaps.
3. Query `calendar/events/` for the week. Calendar entries are evidence of what was scheduled, never proof that it happened.
4. Call `vault_get_audit_log(since=<week Monday>, limit=200)`. This is important: inspect what was actually written or changed by any client during the week so work does not disappear merely because it is already finished or no longer on a task list.
5. Use `vault_get_tasks`, `vault_get_briefing` and `vault_query_notes` where they save reading. Follow relevant changed project/person/list pages when the audit trail or journals show they materially belong to the week's story.

At this stage, summarize internally what appears to have happened. Do not write the weekly report or do housekeeping yet.

## Getting the weekly recap

Show the owner a reminder shaped from the gathered evidence, then ask for one natural recap. The reminder should name the main things already visible and prompt for what the vault cannot know.

Use roughly this shape, adapted to the actual week rather than copied mechanically:

```
Weekly recap for <date range>:

I already have: <short reminder of the main events, work, projects, people or changes found in the vault>.

Tell me how the week actually went in your own words: how your focus and energy held up, what mattered or stood out, what shipped and what slipped, anything important that's missing or misleading in what I found, and what you want to prioritize next week or next sprint.
```

Use `procedure:daily-recap-template` for tone and coverage. This is a reminder for a free-form account, not a questionnaire and not seven Daily Close prompts pasted together.

Wait for the owner's answer before producing the report or changing task priorities. If the owner explicitly says there is nothing more to add, continue with the gathered evidence.

## Producing the weekly account

Write one clean, readable account to `lists/journal/weekly/YYYY-Www.md`.

The account combines:
- the owner's weekly recap as the primary interpretation of how the week went;
- daily accounts and raw journal entries;
- tasks completed, moved, added or left unresolved;
- calendar events that the owner/journal confirms actually happened;
- meaningful project, people, list and reference changes visible in the audit trail.

The audit log is evidence, not prose. Do not turn tool operations, file edits or every changed note into the report. Extract the real-world or project-level change they represent.

Write a coherent account of the week, not a KPI report or a day-by-day dump. Preserve important wins, problems, decisions, shipped work, blockers, projects, changes of direction and unresolved threads when they actually mattered. Keep the owner's meaning and wording where useful, tidy it for readability, and never invent connective detail.

The weekly report is a summary layer. Durable facts still belong in their standing homes and tasks still belong in the task files. Do not make the weekly account a second canonical project/task database.

New weekly pages use:

```
---
created: YYYY-MM-DD
type: journal
status: active
areas: []
---
```

Use the review date for `created`; the ISO week in the filename identifies the period being reviewed.

## Focus and energy

Daily values stay in `lists/logs/work-energy.md`, written by Daily Close. The Weekly Review reads that week's lines and describes the pattern in the weekly account when it matters (a run of `fragmented` days, stress climbing toward 4 or 5), alongside what the owner's recap says. Never backfill missing days from one weekly impression. When stress stayed at 4 or above most of the week, add one questions-file suggestion with a concrete default (decline a recurring meeting, move a commitment to Next up).

## Task-layer housekeeping and next week

After receiving the recap and while producing the account, reconcile the task system:

- Keep `Today` for due/overdue, explicitly urgent or deliberately chosen-today work.
- Review `This week`. Move stale accidental entries back to the appropriate Backlog layer under the existing Todo rule. Never demote something the owner deliberately placed there unless the recap changes that choice.
- Use the owner's stated next-week priorities to deliberately pull appropriate work into `This week`. Do not fill the week automatically.
- Keep real due dates within seven days in `This week`.
- Update `Waiting` and `Follow-ups` where the week's outcome establishes a blocker, resolution or person action.
- Close tasks that the evidence and owner confirm are done, following the normal durable-fact and Done rules.
- Record releases the week shipped in `lists/logs/shipped.md` and feedback or wins in `reference/me/career.md` when not already there.
- Update relevant project `## State`, `## Blockers`, `## Next` and `## Log` when the review establishes a real change that is not already recorded.

The result should make the past week understandable and the coming week intentional.

## Running a weekly review

1. Load the rules needed for task moves and journal writing, then read this procedure and `procedure:daily-recap-template` in full.
2. Resolve the Monday-Sunday week.
3. Gather task layers, Journal/daily accounts, calendar events and audit history. Follow only materially relevant changed pages.
4. Present the shaped weekly reminder and ask for the owner's recap. Wait for the answer.
5. Reconcile durable facts, project state and task layers from the combined evidence and recap.
6. Write the single weekly account to `lists/journal/weekly/YYYY-Www.md`.
7. Verify that the report reflects meaningful changes rather than tool activity, no task was silently lost, calendar entries were not treated as proof of attendance, and no missing energy values were invented.
8. Add one line to `_meta/LOG.md` summarizing the Weekly Review and major housekeeping performed.

## Server/tool boundary

No Weekly Review-specific MCP tool is expected. Existing audit, query, task and briefing tools cover the workflow.

Only consider a deterministic time/week helper after real repeated friction. It must merely calculate or resolve dates, save meaningful calls or context, and make no judgment about what matters or where anything belongs. If that threshold is reached, ask the owner before adding server/MCP work.
