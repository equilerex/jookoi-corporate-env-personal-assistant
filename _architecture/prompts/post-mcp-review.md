# Post-MCP review prompt

Paste everything below the line into a fresh agent session opened at the repo root, once the MCP server refactor is finished and the server starts.

---

You are reviewing `jookoi-corporate-env-personal-assistant`: a work-only second brain for one developer on one corporate workstation. It has three parts:
- a plain-markdown vault (`vault/`)
- a local HTTP MCP server (`jookoi-md-mcp/`) that AI clients (Copilot CLI, VS Code Copilot, Gemini CLI, Claude Code) use to read and write that vault
- the instructions the server serves to those clients (`vault/_AI_INSTRUCTIONS.md`, `vault/_procedures/`)

The repo was migrated from a personal Obsidian vault, so personal-life leftovers and Obsidian assumptions are the most likely defects.

## Read first

1. `AGENTS.md`, `_architecture/ARCHITECTURE.md`, and `_architecture/plans/decision-history/` (index plus decisions 003, 004 and 005 in full).
2. `node scripts/paper-trail.js list` and `list --status=parked`: the open work. Don't report what an item already tracks as a new finding; say which item covers it.
3. `vault/_AI_INSTRUCTIONS.md` and every file in `vault/_procedures/`.

Don't read `_architecture/archive/`.

## Ground rules

- Report findings. Don't fix anything unless it's a typo, and list every change you did make.
- Every finding needs evidence: `file:line`, a command and its output, or a tool call and its result. No "might", no style opinions.
- Don't commit or push.
- Read `vault/reference/_jookoi-secrets.md` only to confirm it exists and is untracked. Never print its contents.
- The design rules are settled (decisions 003, 004): work-only vault, wikilink provenance, credentials stored in full in the git-ignored secrets file, no server-side reasoning. Report where the code or docs break them, not whether you'd prefer different ones.

## 1. Server runs and is safe on localhost

- Start it (`npm run mcp:start:bg` or `npm run mcp:start:win:bg`) and check `npm run mcp:health`. Report the startup time until the index is ready.
- Confirm it binds `127.0.0.1` only. In WSL with mirrored networking, check it isn't reachable on the LAN address.
- Authentication: the README says the server is unauthenticated for local use. The vault now holds credentials in full (decision 004), so check what any local process or browser page can do:
  - Can a request with a foreign `Origin` header or a non-localhost `Host` header read `reference/_jookoi-secrets.md`? Test with curl, and report exact status codes.
  - Is there DNS-rebinding protection?
  - State the risk plainly and propose the smallest fix (API key, Origin/Host allow-list).
- Compare `jookoi-md-mcp/mcp.env` with `mcp.env.example` and `jookoi-md-mcp/README.md`: `VAULT_PATH`, `LOCK_PATH`, `AUDIT_LOG_PATH` and `TELEMETRY_PATH` must point at the same checkout. `WRITE_PATHS` must cover every folder the instructions route to (`teams/` included, `work/` and `research/` gone).
- Run the test suite (`npm test`). Report failures verbatim, and any tests that still assume personal-vault paths.

## 2. Server ↔ vault contract

The server hardcodes file names and headings. Check each against the vault:
- `TASK_FILES`, `TODO_FILE`, `PLANNING_FILES` (`tools/assistant.py`) and the sections `get_briefing` reads (`Today`, `Waiting`) exist in `Todo.md`, `Backlog.md` and `Follow-ups.md`, with `## Done` last in each.
- `PROCEDURES_FOLDER`. Also, every `procedure:<name>` mentioned anywhere in `_AI_INSTRUCTIONS.md` or `_procedures/` must have a matching file.
- `vault_get_vault_conventions(section=[...])`: every section name in the instructions' index list must match a real `##` heading exactly.
- Every tool the instructions and procedures name must exist under that exact name and not be in `DISABLE_TOOLS`. Collect the list with a grep for `vault_[a-z_]+`. Examples: `vault_move_note`, `vault_get_audit_log`, `vault_get_periodic_note`, `vault_add_task` with its `added` argument, `vault_complete_task` with `done_date`.
- `vault_get_audit_log` must read the log at `AUDIT_LOG_PATH`, outside the vault.
- The server's own handshake and tool descriptions shouldn't mention Obsidian, the phone, Google or personal paths (item d7iz lists known ones).

## 3. Instructions and procedures are consistent

- Every path the rules name (routing table, standing files, buckets, layout) must either exist or be creatable inside `WRITE_PATHS`. Every template they name must exist in `vault/Templates/`, and the frontmatter `type` values must match the templates.
- Look for contradictions between `_AI_INSTRUCTIONS.md` and each procedure on: credentials, provenance link style, `⏫` on PR reviews, project archiving to `projects/_archive/`, Waiting vs Follow-ups, the capture move to `Inbox/_done/`, and the day boundary.
- Grep `vault/`, `skills/`, `AGENTS.md` and `README.md` for personal or Obsidian leftovers, and report each real hit. Terms: `google`, `keep`, `phone`, `voice`, `obsidian`, `meld`, `sync`, `birthday`, `shopping`, `health`, `dream`, `creative`, `packing`, `waking`, `mood`, `tasks plugin`, `work/`, `research/`, `password manager`, `%%`.
- `skills/jookoi-brain-mcp` and `skills/jookoi-brain-api` must agree with the vault rules they summarize.

## 4. End to end through a real client

Connect at least one real client (Copilot CLI or Gemini CLI, using the config from the README) and do each step through it, not through direct file edits. Record each client's MCP config and whether the org policy allowed MCP at all.

1. **Triage.** Write this capture to `vault/Inbox/2026-10-01-090000.md` from `Templates/capture.md` (`captured: 2026-10-01 09:00`, `source: review`), then ask the client to triage the Inbox:
   ```
   [ ] review PR 5120 for Priya
   standup: search epic blocked, waiting on the platform team's indexing API
   staging db password for review-test: FAKE-not-a-secret-8841
   Priya moved to the platform team this week
   idea: add a flaky-test dashboard
   ```
   Expected results:
   - the PR review in Today without `⏫`
   - a Waiting line plus `## Blockers` on a search epic page
   - the password only in `_jookoi-secrets.md`, replaced by a link in the capture
   - Priya's team updated on `people/Priya.md`, with provenance
   - the idea in Someday or `lists/ideas/`
   - the capture at `Inbox/_done/` with `triage: done`
   - a `_meta/LOG.md` line
   
   Then check `git status` and `git grep FAKE-not-a-secret` return nothing tracked.
2. **Daily close** for that day: it must ask a shaped question before filing, and write `lists/journal/daily/2026-10-01.md`, a `work-energy.md` line only if you gave focus and stress, and an HTML close marker.
3. **Morning brief:** no writes, and PR reviews first.
4. **Quick edit:** "what's the staging db password for review-test" should come back from the secrets file.
5. **Weekly review:** stop after its shaped prompt, and check the prompt names the week's real content.

Then revert the test data (the capture, pages, task lines, secret, log lines), and list what you reverted.

## 5. Docs match reality

`README.md`, `AGENTS.md`, `ARCHITECTURE.md` and decisions 001 to 005 must describe the server as it now runs: install method, transport, auth, ports, paths and folder layout. Report each statement the code contradicts.

## Output

1. A findings table, most severe first, with columns: severity (blocker / high / medium / low), area (1 to 5 above), `file:line` or command, what's wrong, evidence, smallest fix. Mark findings a paper-trail item already covers with that item's ID and title.
2. The results of section 4, step by step: pass or fail, with what actually happened.
3. What you couldn't check and why.

Finally, record the review with the `jookoi-paper-trail` skill:
- one item per blocker or high finding
- one item for the rest together
- close or update the items it resolves: epa0 "Restart MCP server and test the corporate vault rules end to end", d7iz "Server leftovers from the personal vault, for the server refactor"
