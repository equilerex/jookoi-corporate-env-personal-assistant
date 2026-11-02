# jookoi-corporate-env-personal-assistant

A portable second-brain template for a single corporate workstation. It is a folder of plain Markdown files (`vault/`). An AI assistant reads and writes that folder directly, and a small local viewer lets you read and edit the same files by hand.

There is no server, no database, no sync service and no third-party account. Everything lives in the repo folder, and git history is the change log.

---

## Layout

```
├── vault/                     # The second brain: plain markdown
│   ├── _AI_INSTRUCTIONS.md    # Routing and behavioural rules for the AI
│   ├── _procedures/           # Workflows: triage, daily close, quick edits, ...
│   ├── Templates/             # Note templates (person, project, list, reference, ...)
│   ├── Todo.md, Backlog.md    # Task lists
│   ├── Journal/               # Daily notes (YYYY-MM-DD.md)
│   ├── Inbox/                 # Raw captures (triaged into _done/)
│   ├── people/, projects/, teams/, reference/, lists/
│   └── reference/_jookoi-secrets.md   # Git-ignored. Full credential values only
├── viewer/                    # Local web viewer and editor for vault/ (see below)
├── scripts/paper-trail.js     # CLI wrapper for the development work store
├── _architecture/             # Repo memory: ARCHITECTURE.md, items.yaml, plans/
└── package.json               # npm shortcuts
```

---

## Setup

Requirements: Node 26+ for the viewer. Nothing else is needed for the vault itself.

1. Clone the repo:
   ```bash
   git clone <repo-url>
   cd jookoi-corporate-env-personal-assistant
   ```
2. Build the viewer once:
   ```bash
   npm --prefix viewer install
   npm run viewer:build
   ```
3. Point your AI tool at this folder. The tool reads `AGENTS.md` (or its own equivalent) and works on `vault/` with its ordinary file tools.

---

## Using the vault

- **Ask the AI** to file captures, update tasks, prepare a morning brief or run the daily close. It loads the matching file in `vault/_procedures/` and follows it.
- **Edit by hand** in any editor, or in the viewer.
- **Review changes** with `git diff` and commit them yourself. The repo never commits on its own.

Conventions the AI follows:
- **Task format:** `- [ ] task description #calendar ⏫ 📅 YYYY-MM-DD ➕ YYYY-MM-DD` (`➕` created, `📅` due, `⏫` priority).
- **Waking day:** daily notes span the owner's waking day. Notes written between midnight and 06:00 belong to the previous day.
- **Secrets:** credential values go only in `vault/reference/_jookoi-secrets.md`. Every other note refers to them by heading, never by value.
- **No bulk generation:** notes are created when needed.

---

## Vault Viewer

`viewer/` is a local web page for browsing, searching and editing the vault: a folder tree, Markdown with mermaid, full-text search, save, rename, move (drag and drop), delete, download and print to PDF. It reads and writes the same files the AI works on, with no database and no login. It binds to `127.0.0.1` only.

```bash
npm run viewer:start      # http://localhost:4180, needs Node 26+
```

Details, the API and the rules the server enforces are in [viewer/README.md](viewer/README.md).

---

## Commands

```bash
npm run viewer:start      # Start the viewer on vault/
npm run viewer:build      # Rebuild viewer/dist after changing viewer/web
npm run viewer:test       # Run the viewer server tests

npm run paper-trail:list  # List active development items
npm run paper-trail:check # Verify the work store
npm run paper-trail:sweep # Check for unrecorded changes against the store
npm run paper-trail:flush # Archive completed development items
```

---

## Development notes

Development work is tracked in `_architecture/items.yaml` through the `jookoi-paper-trail` skill. Architecture is in [_architecture/ARCHITECTURE.md](_architecture/ARCHITECTURE.md). Agent rules are in [AGENTS.md](AGENTS.md).

---

## License

Template structure and tooling are released under the MIT License.
