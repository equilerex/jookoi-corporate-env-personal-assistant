# corporate-env-personal-assistant

Session: 28-09-2026 12:33. Status: Repo A built and proven end-to-end; Repo B seeding next.

## Context

The vault/obsidian-mcp second-brain system has worked well at home. The user wants the same functionality for a corporate environment: no Obsidian app, no multi-device sync, single machine, local `.md` files only, and MCP-style tool access for GitHub Copilot CLI, Gemini CLI and Copilot Pro (VS Code) instead of Claude.

Two Opus plan-review passes (general-purpose subagent, `jookoi-plan-review` skill) ran against this plan before build start; their findings are folded into the decisions below rather than kept as open questions.

## Two-repo model

- **Repo A** — `D:\repos\serenity\jookoi-corporate-env-personal-assistant`. Personal, reproducible template/skeleton. Git-tracked. No corp data ever lands here. This is where the mechanism gets built and proven first.
- **Repo B** — a separate repo on the user's private corp git remote, seeded from Repo A's skeleton, enriched with real work vault content on the job.
- Sync between them is manual and one-directional: architecture/mechanism changes flow A → B only, by hand, as needed. No subtree, no submodule, no pull automation, no B → A path. This was a deliberate simplification after review flagged sync-mechanism risk — the user's call was "don't engineer the system around it."

## Reference repos (read before building)

- `C:\JooKoi-vault` — the repo this is modeled on. `AGENTS.md`, `_architecture/ARCHITECTURE.md`, `vault/_AI_INSTRUCTIONS.md`, `vault/_procedures/`, `ops/obsidian-mcp/`, `ops/server/patches/`.
- `D:\repos\serenity\obsidian-mcp` — clean upstream v2.1.0 checkout, no patches applied. Source for `jookoi-md-mcp/`.
- `D:\repos\serenity\JooKoi-md-archive` — view/search app. Out of scope for this build (see below), kept here only as a future reference.

## Structure (each repo, single git-tracked tree)

```
<repo>/
├── AGENTS.md              # from JooKoi-vault, Obsidian/Sync/phone refs stripped incrementally, not blocking
├── _architecture/         # same shape as JooKoi-vault (items.yaml via paper-trail, plans/, decision-history/)
├── vault/                 # git-tracked, single data folder
└── jookoi-md-mcp/          # root-level subfolder, the MCP server
```

`md-archive` is explicitly not part of this build — deferred to a separate follow-up project, not scoped here.

### vault/

Full copy of JooKoi-vault's `vault/` structure and prompts, then AI-stripped of personal content — not an allowlist, a copy-then-strip pass. The strip runs in a **scratch copy outside git**, before any `git add`, because deleting from a commit doesn't remove it from history.

Excluded outright, not AI-judged (all Obsidian plugin/tooling folders plus these specifically named ones): `.smart-env/`, `.trash/`, `.claudian/`, `.grimoire/sessions`, `AI Skills Manager/`, `.obsidian/`, `.tmp.drive*`.

AI-stripped (content collapsed to one template example + "author" placeholder, not deleted structure): `people/`, `work/`, and equivalent personal-content folders.

Kept as skeletons, not blanked or deleted: task/procedure files whose heading structure the MCP patches depend on (`Todo.md`, `Backlog.md`, `Follow-ups.md`, `_meta/LOG.md`, `_procedures/`, `_AI_INSTRUCTIONS.md`). These file names and section headings are load-bearing — patch 0002 hardcodes `TASK_FILES`, `TODO_FILE`, `PROCEDURES_FOLDER`, and `get_briefing`/`get_tasks` read specific headings inside them. Document this fixed-name dependency in the new repo's `ARCHITECTURE.md` and `AGENTS.md`; don't rename or restructure these files without updating the server config first.

`.gitignore` is rewritten fresh for the new repo, not copied (JooKoi-vault's has ~dozens of vault-specific entries that don't apply).

Obsidian-specific references (`_AI_INSTRUCTIONS.md` wording, Sync/phone routing, server `write_paths`, secrets pointing at Meld Encrypt) are stripped **incrementally, live**, as a last sweep before the vault goes into real use — not upfront. Vault format/needs only firm up once the technical mechanism works, so pre-editing this now would be premature.

### jookoi-md-mcp/

Plain copy of `obsidian-mcp` source (v2.1.0) plus the 3 existing patches from `JooKoi-vault/ops/server/patches/`, committed directly into the repo. No external upstream clone kept, no `mcp.sh`-style worktree/git-clean workflow reused against this repo's own tree (that workflow assumes an external `$SRC`; here the repo itself is the source). This trades away the tag-bump upgrade path — accepted, not fixed, per "stop overengineering" — a single repo with a single data folder, no subtree tracking.

**Platform: WSL only, not git-bash.** Confirmed hard requirement — `_require_secure_platform()` in `storage/filesystem.py` needs `O_NOFOLLOW` and dir_fd support for `open`/`rename`/`unlink`/`mkdir`. Native Windows Python (what git-bash runs) has none of these; the server raises `SecureStorageError` on every file op. WSL, Python ≥3.12, `uv` installed inside it.

**Transport: one shared local HTTP server**, not per-client stdio. All three clients (Copilot CLI, Gemini CLI, VS Code Copilot) point at the same running process via HTTP + API key, localhost only. Rationale: avoids 3x cold index builds and 3x separate lock holders on one vault.

**Lifecycle:** a startup script (user-owned, not paper-trailed further — implementation detail) starts and keeps the server running in WSL. No systemd unit prescribed by this plan.

**Naming:** folder renamed to `jookoi-md-mcp/` (the "obsidian" name is misleading — no Obsidian app involved). Python package name (`obsidian_mcp`), entrypoint (`obsidian-remote-mcp`) and patch internals are left untouched — renaming those would invalidate the 3 patches, which target `src/obsidian_mcp/...` paths. Confirmed safe to skip entirely at launch if it ever destabilizes anything; folder-only rename carries no such risk since the patches use repo-relative paths.

**Config specifics** (`HOST=127.0.0.1` explicit — defaults to `0.0.0.0`/LAN-reachable under WSL mirrored networking; `LOCK_PATH`/`AUDIT_LOG_PATH` outside `vault/`, gitignored; reconcile-interval tuning for index staleness) are implementation-time decisions, not planned in detail here — flagged as known traps to watch for, not specced.

## Build order

1. **Step 0 — verify corp preconditions before building anything corp-specific:** WSL availability, org-level "MCP servers" policy for Copilot Business/Enterprise (off by default on some orgs — if off, Copilot CLI/VS Code won't use the server regardless of how it's built; Gemini CLI may be the only usable client), PyPI/proxy access for `uv sync`. Repo A proves the mechanism at home; it proves nothing about the corp machine. If MCP is blocked at the policy level, fallback is skills with API specs instead of MCP tools — build MCP first, keep that fallback in mind.
2. Build Repo A: copy structure from JooKoi-vault, strip `vault/` per the rules above, bring in `jookoi-md-mcp/`, get the shared HTTP server running and reachable from at least one client locally.
3. Wire the three clients (Copilot CLI, Gemini CLI, VS Code Copilot) to the running server — exact MCP config syntax per client to be pulled from current docs at implementation time (ctx7), not written from memory.
4. Prove read/write/search work end to end through all three clients against the skeleton vault.
5. Instructions/procedures cleanup sweep (`_AI_INSTRUCTIONS.md`, secrets rule, remaining Obsidian wording) — last step before Repo A is considered "reproducible and live-usable," not before.
6. Seed Repo B from proven Repo A; enrich with real work content there. No further sync tooling — manual, one-directional, as needed.
7. Commit discipline: a written reminder in `AGENTS.md`/MCP handshake text, not an automated hook or timer. Local changes are committed explicitly on the user's own request — deliberate choice against the reviewer's auto-commit-timer suggestion, treated as overengineering for this use case.

## Explicitly out of scope for this plan

- md-archive integration (SQLite→MD data-layer swap) — separate follow-up project.
- A→B sync automation — manual only, by design.
- Auto-commit tooling in Repo B — explicit user-triggered commits only.
- Fine-grained per-client API keys / audit attribution — accepted limitation of one shared API key.

## Implementation deviations

- **Port 8008 bound instead of 8000:** local dev process (node, PID 15460) was already bound to port 8000; port 8008 was selected for the HTTP MCP server.
- **Meld Encrypt reference scrubbed:** in `_AI_INSTRUCTIONS.md`, `_procedures/triage.md`, `_procedures/quick-edit.md`, and `reference/accounts.md`, references to Meld Encrypt blocks were replaced with generic password manager / secure vault guidance, matching the "no Obsidian app" architecture.
