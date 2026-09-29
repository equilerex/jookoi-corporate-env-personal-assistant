# Architecture — jookoi-corporate-env-personal-assistant

Repo A is the personal, reproducible template for a single-workstation corporate second-brain. It provides a structured personal assistant and knowledge base implemented entirely in plain Markdown files on local disk, accessed concurrently by multiple AI agents via the Model Context Protocol (MCP).

The system is fully self-contained: plain CommonMark files under `vault/` served by a local HTTP MCP daemon (`jookoi-md-mcp`), with no desktop applications, community plugins, or cloud sync services required.

Full design records: `_architecture/plans/` (see `plans/2026-09-28-corporate-env-personal-assistant.md` and `plans/decision-history/`).

---

## 1. System Topology

```
<repo-root>/
├── AGENTS.md                  # Operational rules for AI agents in this repo
├── _architecture/             # Durable project memory (paper-trail store, plans, decisions)
│   ├── ARCHITECTURE.md        # This technical architecture document
│   ├── items.yaml             # Live development tasks (managed via jookoi-paper-trail script)
│   └── plans/                 # Dated plans and decision-history/
│       ├── 2026-09-28-corporate-env-personal-assistant.md
│       └── decision-history/  # Numbered ADRs (001, 002, ...)
├── vault/                     # The data layer: tasks, dossiers, reference, procedures
│   ├── _AI_INSTRUCTIONS.md    # Master routing and behavioral instructions for agents
│   ├── _procedures/           # Operational procedures served dynamically via MCP
│   ├── Templates/             # Structural templates for notes
│   ├── Todo.md, Backlog.md    # GTD task layers (Today, This week, Next up, Committed, etc.)
│   ├── Follow-ups.md          # Delegated and waiting person-actions
│   ├── Questions.md           # Asynchronous owner-agent dialogue
│   ├── projects/, people/, teams/, reference/, lists/  # Canonical living pages
│   └── _meta/                 # Triage run logs and handled questions archive
└── jookoi-md-mcp/              # The MCP server (FastMCP markdown vault service committed directly)
    ├── pyproject.toml         # Python dependencies (installed in a local virtual environment)
    ├── mcp.env                # Local runtime environment (gitignored)
    ├── run.sh                 # WSL execution script
    ├── .locks/                # External filesystem concurrency locks (gitignored)
    ├── audit.log              # Mutation audit log (gitignored)
    └── telemetry.log          # Call timing, token estimates, outcomes (gitignored)
```

---

## 2. Data Layer (`vault/`)

The data layer is composed entirely of plain UTF-8 Markdown files.

### Content Model
- **Task Hierarchy:** Split into strict temporal and commitment layers across `Todo.md` (`## Today`, `## This week`, `## Waiting`, `## Done`), `Backlog.md` (`## Next up`, `## Committed`, `## Unreviewed`, `## Someday`, `## Done`), and `Follow-ups.md`.
- **Living Pages:** Single canonical home per entity under `projects/` (`epics/`, `initiatives/`, `admin/`, `events/`, `_archive/`), `people/`, `teams/`, `reference/` (`me/`, `engineering/`, `product/`, `howto/`), and `lists/`. The vault is work-focused; routing rules live in `vault/_AI_INSTRUCTIONS.md` (decision 003). `WRITE_PATHS` in `jookoi-md-mcp/mcp.env` must list every top-level folder agents write to.
- **Chronological Logs:** Append-only dated records under `lists/logs/` (e.g. `done.md`, `shipped.md`).
- **Asynchronous Dialogue:** `Questions.md` allows agents to surface decisions, proposed defaults, and clarifications without interrupting flow. Handled items archive to `_meta/questions-archive.md`.
- **Inbox Lifecycle:** No background job touches the vault. Triage sets `triage:` on a capture and moves it directly (`vault_move_note`) to `Inbox/_done/` or `Inbox/_unresolved/`. The audit log is `jookoi-md-mcp/audit.log`, outside the vault, read through `vault_get_audit_log`.

### Syntax & Secret Boundaries
- **Markdown Syntax:** Syntax adheres to standard CommonMark with lightweight wikilinks (`[[Note]]` or `[[Note#Section]]`), standard frontmatter YAML (`type`, `status`, `areas`, `created`), and checkboxes (`- [ ]`).
- **Credential & Secret Boundaries:** Credentials are stored in full in `vault/reference/_jookoi-secrets.md`. The `_jookoi-*` rule in `.gitignore` keeps it local; the MCP server reads and writes it like any note. Every other vault file is committed and references external password managers or points to the secrets note rather than containing secret values directly (decisions 002, 004).

### Fixed-Name & Heading Contracts
The server hardcodes `TASK_FILES`, `TODO_FILE`, and `PROCEDURES_FOLDER` in `src/jookoi_md_mcp/jookoi.py`. The assistant tools (`vault_get_briefing`, `vault_get_tasks`, `vault_add_task`, `vault_complete_task`) rely on specific filenames (`Todo.md`, `Backlog.md`, `Follow-ups.md`, `_meta/LOG.md`) and section headings (`## Today`, `## This week`, `## Done`). These cannot be renamed without modifying the server source.

---

## 3. Server & Protocol Layer (`jookoi-md-mcp/`)

The server exposes the vault to AI tools over standard Model Context Protocol interfaces.

### Server Architecture & Features
The server is a standalone FastMCP Python service implementing deterministic storage, indexing, and assistant operations:
1. **Audit & Caller Attribution:** Logs file mutations to `audit.log` with attribution (`client: api-key`).
2. **Ergonomics & Telemetry:**
   - Provides `ToolAnnotations` (`read_only_hint`, `idempotent_hint`, `destructive_hint`) so AI clients treat read operations safely without prompting.
   - Handshake optimization: provides short `core` instructions and dynamically serves detailed procedures via `vault_get_vault_conventions`.
   - Instruments tool invocations into `telemetry.log` (latency in ms, response byte counts, token estimates, outcome codes).
   - Injects ergonomic assistant tools (`vault_get_briefing`, `vault_add_task`, `vault_complete_task`, `vault_move_task`, `vault_list_entities`).
3. **Write Preconditions & Log Series:** Surfaces structured error contexts on write denials and adds typed observation extraction for dated notes (`vault_get_log_series`).

### Platform & Isolation
- **Platform Requirement:** Linux (WSL2 `Ubuntu` on Windows; native on macOS/Linux). The server uses `_require_secure_platform()` in `storage/filesystem.py` requiring `O_NOFOLLOW` and `dir_fd` open/rename operations to guard against symlink path traversal. Native Windows Python lacks these primitives and raises `SecureStorageError` on write attempts.
- **Python Runtime:** Python ≥ 3.12 in `jookoi-md-mcp/.venv`; standard `venv` and `pip` suffice. The FastMCP dependency tree contains compiled wheels, so installation still depends on corporate package approval (decision 005).

### Concurrency & Locks
- Rather than per-client stdio subprocesses, a single shared local HTTP daemon serves all clients.
- File locks are maintained outside `vault/` in `jookoi-md-mcp/.locks/` using platform file locking (`fcntl`), allowing concurrent reads while serializing atomic note updates across multiple AI clients.

---

## 4. Network & Runtime Details

- **Host & Port:** `http://127.0.0.1:8008` (Decision 001; binds explicitly to loopback).
- **Protocol:** FastMCP Streamable HTTP at `/mcp` (SSE transport over HTTP POST/GET) and health status at `/health`.
- **Authentication:** Unauthenticated on loopback. No headers or tokens required for local AI clients. `HOST` defaults to `127.0.0.1`, and the server refuses to start on a non-loopback host unless `API_KEY`, a `VAULTS_CONFIG` identity or GitHub OAuth is set. FastMCP's Host/Origin guard (`host_origin_protection="auto"`) rejects foreign `Host` and browser `Origin` headers, which blocks DNS rebinding from web pages (decision 006).
- **Process Management:**
  - WSL runner: `jookoi-md-mcp/run.sh`
  - Cross-platform shell runner: `run-mcp.sh`
  - Windows launcher: `run-mcp.ps1` (with optional `-Background` switch)

---

## 5. Client Integrations

All supported AI tools connect to the shared HTTP daemon:

1. **GitHub Copilot CLI:**
   - Configuration: `~/.copilot/mcp-config.json`
   - Transport: `"type": "http"`, `"url": "http://127.0.0.1:8008/mcp"`
2. **VS Code Copilot (GitHub Copilot Chat):**
   - Configuration: Global `%APPDATA%\Code\User\mcp.json` and workspace `.vscode/mcp.json`.
   - Transport: Top-level `"servers"` dictionary, `"type": "http"`, `"url": "http://127.0.0.1:8008/mcp"`
3. **Gemini CLI / Antigravity:**
   - Configuration: `~/.gemini/config/mcp_config.json`
   - Transport: `"serverUrl": "http://127.0.0.1:8008/mcp"`
4. **Direct HTTP API Clients:**
   - Documented in `skills/jookoi-brain-api/SKILL.md` for tools or scripts without native MCP client config.

---

## 6. Two-Repo Model & Sync Lifecycle

- **Repo A (Template / Sandbox):** Local personal repo (`D:\repos\Serenity\jookoi-corporate-env-personal-assistant`). Contains generic template skeletons, test placeholders, server code, and architecture plans. No proprietary or real work data is stored here.
- **Repo B (Corporate Live):** Hosted on the private corporate git remote. Seeded once from Repo A's skeleton, then enriched with real work dossiers and notes.
- **Sync Boundary:** Strictly manual, one-directional (Repo A → Repo B) for server updates or procedural changes. No subtrees, submodules, or automatic synchronization.
- **Commit Discipline:** Commits are explicit and user-triggered only. No automatic commit timers or hooks.
