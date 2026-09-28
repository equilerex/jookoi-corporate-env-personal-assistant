# Daily close procedure

How to keep the workday's raw record in `Journal/YYYY-MM-DD.md`, and at the end of the day, get the owner's own recap and file what the day holds. Routing, layers, provenance and formats all come from `procedure:triage` and the vault's rules. This file only says how a daily note is written, how a close gets and uses the recap, and how it finds its unprocessed part.

Daily Close is a combination, not a silent scrape. The agent gathers what it can first (the day's raw entries, tasks touched, calendar events) and uses that to shape a specific question, then asks the owner to fill in and confirm what only they know: how the workday felt, what the gathered facts actually meant, blocker context, and anything not written down. Never run the filing steps below without asking that shaped question and receiving an answer first (see "Getting the recap").

## Which day an entry belongs to

A journal day is the owner's working day, not strictly midnight to midnight. It starts when they begin work and ends when they log off. If they work a late deployment or incident on Sep 25 until 02:00 on Sep 26, everything in between belongs to `Journal/2026-09-25.md`. Choose the target date like this:

1. If the owner names the day ("for yesterday", "still today"), use it.
2. Otherwise, if the clock is between 00:00 and about 06:00 and the conversation shows the owner is still finishing work from the previous day, use the previous calendar date.
3. Otherwise use the clock's date. The server's `date="today"` never decides this alone. When it is unclear which workday an entry belongs to after midnight, ask one short question instead of guessing.

The entry's `HH:mm` stays the real clock time. A close for a working day that has not ended yet uses the same rule and only files what is already there.

## The daily note

`vault_get_periodic_note(period="daily", date="YYYY-MM-DD")` resolves a day's note to `Journal/YYYY-MM-DD.md` and says whether it exists. Always pass the date chosen above: after midnight, `date="today"` can be the wrong day. If the note doesn't exist, create it with `vault_write_note` and `create_only: true`:

```yaml
---
created: YYYY-MM-DD
type: journal
status: active
areas: []
---
```

Nothing else: no headings, no template sections, no tasks carried over from earlier days (open tasks live in the task files). On `already_exists`, read it instead.

Entries go at the end, oldest first, one per line:

```text
- 08:12 standup: blocked by payments API team
- 09:40 must review Martin's PR today
    checked the test coverage, looks good
- remembered: need to request AWS access for the new initiative
```

- `- HH:mm <text>` with the time the owner said it. Without a known time, `- <text>`.
- Add with `vault_append_to_note`. Keep the owner's wording. Fix only obvious dictation errors. Keep technical jargon, identifiers and ticket keys exact.
- Any AI or the owner (typing directly into the note) may add entries during the day. The default is to append, so the raw wording survives.

## Corrections

The server does not block edits to `Journal/`: `vault_patch_note_text`, `vault_patch_note` and `vault_write_note` all work on daily notes, and every edit lands in the server's audit log (`vault_get_audit_log`). The default is to append, but edit whenever it helps: a mistake, a pasted error trace that needs formatting, a wrong date (see the day rules above), a misplaced line, a credential to move to `reference/_jookoi-secrets.md`, a close marker that no longer matches its entries, or the owner's request. No age limit, no need to ask first.

How: read the note, use `vault_patch_note_text` with `expected_revision` (`dry_run` first when the match is not obvious), and keep each change small and limited to what the reason covers. Do not rewrite the note wholesale, and do not reword an entry just to tidy it. A normal close still only appends its marker. If a removed entry was already filed by a close, its filed items stay unless they are wrong too: then fix them in their destinations (find them by the `([[Journal/YYYY-MM-DD]])` provenance link, `vault_get_backlinks`). Say what you changed and why.

If a write is refused, quote the server's error message to the owner as is. The message names the rule that refused it. Never retry with a different tool to get around a refusal.

## Getting the recap

Before asking anything, gather what's already there for the workday being closed: its raw journal entries, tasks touched or added that day, calendar events (`vault_query_notes(folder="calendar/events", frontmatter_filter={"date": {"$gte": "<day>", "$lt": "<next day>"}})`), and `vault_get_audit_log(since="<day>", limit=100)` for what any AI or the owner actually wrote that day, not just what's in the journal (a task added mid-day, an epic page edited, a capture triaged). This is a first pass to shape the question, not filing.

Then ask the owner, using `procedure:daily-recap-template` as the checklist, but as a shaped question built from what you found, not a blank form: name what you already have ("you had the 1:1 with Sarah and worked on the checkout PR") and ask for what only they know (untracked blockers, decisions, career conversations, focus and energy). Wait for their answer. Once given, append it to the daily note as normal entries (`- HH:mm <text>` or `- <text>`), dated to the day being closed, before moving to filing. Keep the owner's wording; never discard the raw recap.

If the owner says there's nothing more to add, or would rather close the day tomorrow, respect that and either file what already exists with no recap, or stop and try again later. Don't chase a recap the owner has declined.

## Producing the day's account

Filing extracts durable facts and tasks as triage always does. Separately, write one clean, readable account of the workday to `lists/journal/daily/YYYY-MM-DD.md` (one file per closed day), combining the recap with the day's raw entries, tasks touched and relevant meetings. Tidy for readability without losing the owner's meaning: don't replace their account with a sterile generated report, don't invent detail, and keep technical frustrations, organizational context and anything they said mattered. This is prose, in the owner's voice, not a bullet recap of what got filed.

Focus and energy: if the recap states them, append one line to `lists/logs/work-energy.md` (`- YYYY-MM-DD focus=<label> stress=<1-5> source=[[Journal/YYYY-MM-DD]]`), using the scale at the top of that file. Skip it when the owner didn't say. Never guess a value.

## Close markers

A close appends one HTML comment line (hidden in rendered markdown) after the last entry it processed:

```html
<!-- daily-close 2026-09-25 18:10: 6 entries → Todo 1, Follow-ups 1, people/Sarah, epics/checkout-feature; 1 question -->
```

The unprocessed part of a daily note is everything after its last `<!-- daily-close` line, or the whole body if it has none. A marker is the only change a close makes to a daily note. Entries added after a close are picked up by the next one.

## Running a close

1. Load the rules (`section="all"`), `procedure:triage` and `procedure:daily-recap-template`, and read all in full.
2. Find the work: `vault_list_folder("Journal")`, then read today's note and every earlier daily note from the last 14 days whose body doesn't end in a `<!-- daily-close` line. Older notes only when the owner asks. Take each note's unprocessed part. If none has one, say so and stop.
3. Get the recap ("Getting the recap") for the day being closed, and append it to that note's unprocessed part before continuing.
4. File each unprocessed part (including the recap) with triage's filing rules only: split it into items (triage step 2), route each item and record the durable facts it implies (decisions, shipped features, feedback, credentials; step 3), check for duplicates and make one write per destination (step 4). Look up only the colleagues, teams, epics and pages these entries mention. A close is not a triage run: no vault-wide entity listing, librarian cleanup, archiving of done tasks, answered or stale questions, or other maintenance, unless an entry itself asks for it. Differences from triage:
   - The content date is the note's date, the time is the entry's `HH:mm`. Relative dates resolve against them. Tasks get that date as `➕` (`added`).
   - Where the rules call for provenance, it is `([[Journal/YYYY-MM-DD]])`, a link to the daily note.
   - The day's calendar events are context. They help place entries ("the architecture sync" → which meeting, with whom). An event on the calendar is not proof it happened: record an attendance or a decision only when the entries or the owner confirm it. A close never edits calendar notes.
   - Reflections on career go to `reference/me/career.md`. Reflections on the work, the team or the organization (office politics, frustration, burnout) go to `lists/journal/reflections.md`, the owner's meaning, tidied, no commentary. Judgments about a colleague stay there, never on their `people/` page. The daily note is the raw source they cite, never their home.
   - Credentials go in full to `reference/_jookoi-secrets.md`, and the entry's value is replaced with the link (see the rules).
   - Material already filed from this note is not filed again. Earlier parts can be rerun after an interrupted close: before each write, read the destination and skip an item a line already covers (a matching `([[Journal/YYYY-MM-DD]])` makes it certain, but the content decides). `vault_get_backlinks` on the daily note lists pages that already cite it. `vault_add_task` returns a near-duplicate instead of writing.
5. Write the day's account and the focus/energy line ("Producing the day's account").
6. Append the close marker to each note you processed, as its last write. Read the note first: if entries were added while you worked, put the marker after the last entry you actually filed, with `vault_patch_note_text`, not at the end.
7. Check the filing items of triage's finish checklist (every entry findable in a destination or the questions file, no duplicates, task formats, credentials only in the secrets file), add one line to `_meta/LOG.md` (`daily close YYYY-MM-DD: N entries → ...`), and report as triage does.

A close on a note with nothing after its last marker changes nothing. Never trash, move or rename a daily note, and never set `triage:` on it: it is not an Inbox capture.
