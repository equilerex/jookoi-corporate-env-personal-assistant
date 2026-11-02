# Architecture — jookoi-corporate-env-personal-assistant

Repo A is the personal, reproducible template for a single-workstation corporate second-brain. It is a folder of plain Markdown files on local disk. The AI reads and writes those files directly through its own file tools. There is no server, no protocol layer and no database.

Full design records for the earlier server-based design: `_architecture/archive/` (retired, not read by default). Current decisions: `_architecture/plans/decision-history/`.

---

## 1. System Topology

```
<repo-root>/
├── AGENTS.md                  # Operational rules for AI agents in this repo
├── README.md                  # Setup and usage
├── _architecture/             # Durable project memory (paper-trail store, plans, decisions)
│   ├── ARCHITECTURE.md        # This document
│   ├── items.yaml             # Live development items (managed via jookoi-paper-trail script)
│   ├── plans/                 # Open plans and decision-history/
│   └── archive/               # Retired records, not read unless named
├── vault/                     # The data folder: tasks, people, projects, reference, procedures
│   ├── _AI_INSTRUCTIONS.md    # Routing and behavioural instructions for agents
│   ├── _procedures/           # Workflow procedures (triage, daily close, quick edit, ...)
│   ├── Templates/             # Structural templates for notes
│   ├── Todo.md, Backlog.md    # Task layers (Today, This week, Next up, Committed, ...)
│   ├── Follow-ups.md          # Delegated and waiting person-actions
│   ├── Questions.md           # Asynchronous owner-agent dialogue
│   ├── projects/, people/, teams/, reference/, lists/  # Canonical living pages
│   └── _meta/                 # Triage run logs and handled questions archive
├── viewer/                    # Local web viewer and editor for vault/ (see section 6)
├── scripts/paper-trail.js     # CLI wrapper for the paper-trail store
└── package.json               # Shortcut commands (viewer, paper-trail)
```

---

## 2. Data Layer (`vault/`)

The data layer is plain UTF-8 Markdown files. Nothing else stores state.

### Content Model
- **Task hierarchy:** Temporal and commitment layers across `Todo.md` (`## Today`, `## This week`, `## Waiting`, `## Done`), `Backlog.md` (`## Next up`, `## Committed`, `## Unreviewed`, `## Someday`, `## Done`) and `Follow-ups.md`.
- **Living pages:** One canonical home per entity under `projects/`, `people/`, `teams/`, `reference/` and `lists/`. The vault is work-focused; routing rules live in `vault/_AI_INSTRUCTIONS.md` (decision 003).
- **Chronological logs:** Append-only dated records under `lists/logs/` (e.g. `done.md`, `shipped.md`).
- **Asynchronous dialogue:** `Questions.md` lets agents surface decisions and proposed defaults without interrupting flow. Handled items move to `_meta/questions-archive.md`.
- **Inbox lifecycle:** Triage sets `triage:` on a capture and moves it to `Inbox/_done/` or `Inbox/_unresolved/`. Nothing runs in the background.

### Syntax & Secret Boundaries
- **Markdown syntax:** CommonMark with wikilinks (`[[Note]]`, `[[Note#Section]]`), frontmatter YAML (`type`, `status`, `areas`, `created`) and checkboxes (`- [ ]`).
- **Credentials:** Stored in full only in `vault/reference/_jookoi-secrets.md`. The `_jookoi-*` rule in `.gitignore` keeps it local. Every other vault file is committed and never holds a secret value (decisions 002, 004).

### Heading and filename conventions
The task and procedure files depend on fixed names and headings (`Todo.md`, `Backlog.md`, `Follow-ups.md`, `## Today`, `## This week`, `## Done`). Renaming them means updating `vault/_AI_INSTRUCTIONS.md` and the procedures that name them.

---

## 3. Access Model

- **Single writer at a time.** One person, one workstation. Edits are made directly to the files, by the owner or by an AI working in this repo. There is no sync layer to race against.
- **No server, no index, no audit log.** An AI that needs to find something searches the folder. History is in git: changes are visible in `git diff` and committed explicitly by the owner.
- **Instructions are loaded from files.** An agent reads `vault/_AI_INSTRUCTIONS.md` and the relevant `vault/_procedures/*.md` before a task that needs them.

---

## 4. Platform

- Runs anywhere the AI tool can read and write the repo folder. No runtime, no install step, no WSL or native-platform split.
- The viewer (section 6) needs Node 26+ to run.

---

## 5. Two-Repo Model & Sync Lifecycle

- **Repo A (Template / Sandbox):** This repo. Generic skeleton, procedures, viewer and architecture records. No real work data is stored here.
- **Repo B (Corporate Live):** Hosted on the private corporate git remote. Seeded once from Repo A's skeleton, then enriched with real work notes.
- **Sync boundary:** Strictly manual, one-directional (Repo A → Repo B) for procedural and viewer changes. No subtrees, submodules or automatic synchronization.
- **Commit discipline:** Commits are explicit and user-triggered only. No automatic commit timers or hooks.

---

## 6. Vault Viewer (`viewer/`)

A human-facing web UI over any folder of markdown files. It is independent of the rest of the repo: the folder is a start-up argument (`node viewer/server/index.js --root vault`), and deleting `viewer/` changes nothing else. It lets the owner read, search and make small edits to the same files the AI works on. Decision: `plans/decision-history/007-*.md`. Build plans: `plans/implemented/2026-10-02-vault-viewer.md` and `plans/implemented/2026-10-02-md-archive-adaptation-to-vault-files.md` (its deviations section is the accurate record of what shipped).

- **Server** (`viewer/server/`): plain JavaScript, no runtime dependencies, Node 26+. Binds `127.0.0.1`, checks the `Host` header, no authentication (decision 006). Owns everything that touches the disk: file API, path safety, atomic writes, the search index.
- **UI** (`viewer/web/`): Angular, reused from the old md-archive app with its SQLite backend, login and encryption removed. `viewer/dist/` is gitignored and built by CI (`.github/workflows/ci.yml`, artifact `viewer-dist`); running locally needs `npm run viewer:build` once.
- **Ids are paths.** A node id is the folder-relative path with `/` separators and travels as a `path` query parameter. Renames and moves are filesystem renames and return the new path.
- **Search** is an in-memory BM25 index (name, headings, body) rebuilt per changed file by a stat scan at the start of each search. There is no watcher. If the folder ever grows past a few thousand notes, swap the engine behind `SearchIndex.search(query)`.
- **Concurrency:** last write wins, no conflict check. Saves are atomic and keep line endings and BOM.
- **Files beyond markdown** are listed. Text files open in the editor without a preview. Binary files can only be downloaded or opened in a tab. Search covers markdown only.
- **Not covered:** sanitizing of rendered notes, a file watcher, embeds (`![[file]]`), self-hosted fonts.
- **Config:** the profile (name, title, department) lives in git-ignored `viewer/viewer.config.json`.
