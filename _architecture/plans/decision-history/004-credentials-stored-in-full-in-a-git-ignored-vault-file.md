# Decision 004 — Credentials stored in full in a git-ignored vault file

Date: 28-09-2026 23:40

Status: DECIDED

## Problem

Decision 002 and the first corporate instructions (003) kept credential values out of the vault entirely, with pointers to a password manager. The owner wants the vault to hold them: it runs on one personal machine, has no sync, and is tracked only in the owner's private corporate git. Values must still stay out of git.

## Options considered

- Pointer-only: `reference/accounts.md` names the system, the value lives in a password manager.
- Values in normal tracked notes (`accounts.md`, project pages).
- Values in one `_jookoi-` prefixed file that git ignores, readable and writable through the MCP server like any note.

## Decision

Third option. Values go in full, exactly as given, into `vault/reference/_jookoi-secrets.md`, under a heading per system or project. Every other vault file is committed, so none of them holds a value: they link `(in [[_jookoi-secrets#<heading>]])`. After a value is copied out of a capture or daily note, the source line is replaced with that link, because captures and daily notes are committed too. `reference/accounts.md` keeps systems, URLs, usernames and access notes.

`_jookoi-*` is in the repo's own `.gitignore`, not only in the global gitignore. That way a fresh machine without the global rule can't commit secrets.

Supersedes the credentials part of decision 002.

## Why not the alternatives

Pointer-only fails the owner's need: agents can't hand back a token they were given. Values in tracked notes put them into git history, which can't be undone by deleting the line later.

## Next step

Secrets that reached git before this rule would need a history rewrite. None exist yet: Repo A has no commits.
