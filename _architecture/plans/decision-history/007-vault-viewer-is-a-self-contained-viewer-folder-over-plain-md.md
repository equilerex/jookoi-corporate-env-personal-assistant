# Decision 007 — Vault viewer is a self-contained viewer/ folder over plain md files

Date: 02-10-2026 00:02

Status: DECIDED

<!-- Status is one of: DECIDED | TRIAL | REJECTED | DEFERRED | SUPERSEDED
     A superseding decision gets its own number. The superseded file's status changes
     and its body gains a pointer. A decision already stated in ARCHITECTURE.md or
     AGENTS.md is folded in and the file deleted instead.
     All five sections below are required. -->

## Problem

The vault needs a browsable, editable view. `JooKoi-md-archive` already does that over SQLite, and the build plan deferred it as a separate project. Meanwhile the corporate setup dropped the MCP layer: agents work on `vault/` files directly through their harness, with a plain skill. The viewer is for the human, and no other part of the system depends on it.

## Options considered

- A viewer folder inside this repo, written fresh, copying md-archive pieces only where they fit.
- Extend md-archive with a second storage backend (SQLite or md files) and point it at `vault/` from its own repo.
- Keep SQLite and sync it with `vault/`.

## Decision

Option 1: `viewer/` in this repo, self-contained. It takes the vault path as configuration and reads and writes plain `.md` files, with no SQLite. It imports nothing from the rest of the repo, so it can be pointed at any markdown folder or deleted without touching anything else. Editing stays: the modal editor from md-archive is reused, with no rich editor, because the AI does most edits. Rendering code and components are copied from md-archive only if they fit, otherwise rewritten.

## Why not the alternatives

A dual-backend md-archive carries SQL, auth, and the encrypted-note flag into a tool that needs none of them, and makes the corporate vault depend on a personal repo. A sync layer between SQLite and files is the failure mode the project already rejected for Repo A and B. The self-contained folder gives the same optional, point-at-a-folder property.

## Next step

Write the build plan under `_architecture/plans/` (stack, file-write rules, loopback guard from decision 006), then build under item xp65.
