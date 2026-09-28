# Decision 003 — Vault instructions rebuilt for corporate work use

Date: 28-09-2026 23:02

Status: DECIDED

## Problem

`vault/_AI_INSTRUCTIONS.md` and the vault skeleton were copied from the personal home vault: routing for shopping, health, dreams, packing, creative projects, Google Keep imports and a `work/` side folder. The corporate vault is work-only, so the routing, buckets and worked example pointed agents at the wrong homes.

## Options considered

- Keep the personal file and add a `work/` routing layer on top.
- Adopt an external LLM's corporate draft verbatim.
- Adopt that draft's structure, corrected against this repo's server and conventions.

## Decision

Third option. Work becomes the whole vault: `projects/` (`epics/`, `initiatives/`, `admin/`, `events/`, `_archive/`) is the center, plus `people/`, new `teams/`, `reference/me|engineering|product|howto`, `lists/` (ideas, logs incl. `shipped.md`, meetings, journal). Task file names and headings are unchanged because patch 0002 reads them.

Corrections to the draft:
- Provenance stays wikilinks (`[[capture-name]]`). The draft's path links (`Inbox/x.md`) break when triage moves captures to `Inbox/_done/`.
- `procedure:vault-syntax`, not the draft's nonexistent `procedure:markdown-conventions`.
- PR reviews go to Today without automatic `⏫`. `⏫` stays reserved for urgent or escalated work.
- Waiting vs Follow-ups split: Waiting holds the owner's own blocked task, Follow-ups the owner's action toward someone.
- Ticket keys in task text, not `#ticket-123` tags.
- Calendar described as conditional: no corporate calendar sync exists yet.
- Kept from the old file: event-vs-task distinction, hand-ticked task sweep, 7-day Done archiving, heading-missing rule, full client-refusal string list, `reference/me/profile.md`.
- Added: customer personal data and production data stay in source systems, the vault keeps a pointer.
- Templates `team.md` and `meeting.md` added; `project.md` gains `## Blockers` and `## Decisions`.
- Worked example: no invented role for a colleague, counts corrected.

## Why not the alternatives

A work layer on top of personal routing leaves agents choosing between two sets of homes on every item. The draft verbatim had broken links after triage, a missing procedure name, and contradictory Waiting/Follow-ups rows.

## Next step

Procedures followed the same day: `triage` rebuilt from the owner's corporate draft under the same corrections (wikilink provenance, no auto-`⏫` on PR reviews, finished projects move to `projects/_archive/`), `daily-close`, `daily-recap-template` and `weekly-review` moved from the wake-to-sleep day and mood log to a workday. The owner then chose to store credentials in full, in a git-ignored file: see decision 004.
