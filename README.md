# jookoi-corporate-env-personal-assistant

A portable, self-contained personal second-brain template engineered specifically for single-machine corporate environments. 

It pairs a plain Markdown vault (`vault/`) with a local, patched Model Context Protocol (MCP) server (`jookoi-md-mcp/`) running over Streamable HTTP. It requires **no external desktop application**, **no multi-device sync**, and **no third-party cloud accounts**. AI coding assistants (GitHub Copilot CLI, VS Code Copilot, Gemini CLI / Antigravity, Claude Code) connect to it directly via localhost to read notes, track tasks, manage projects, and log daily activities.

---

## Architecture & Topology

```
┌────────────────────────────────────────────────────────┐
│                   AI Assistant Layer                   │
│   Copilot CLI  •  VS Code Copilot  •  Gemini / AGY     │
└───────────────────────────┬────────────────────────────┘
                            │  HTTP (Streamable SSE)
                            │  http://127.0.0.1:8008/mcp
┌───────────────────────────▼────────────────────────────┐
│              jookoi-md-mcp (Operations Layer)          │
│   • FastAPI + FastMCP HTTP Server                      │
│   • Runtime: WSL Ubuntu (Windows) or Native (macOS)    │
│   • Indexing, per-file locking, optimistic concurrency │
│   • Telemetry & audit logging outside vault/           │
└───────────────────────────┬────────────────────────────┘
                            │  Deterministic file operations
┌───────────────────────────▼────────────────────────────┐
│                    vault/ (Data Layer)                 │
│   Todo.md  •  Backlog.md  •  Journal/  •  Inbox/       │
│   people/  •  projects/   •  reference/ • _procedures/ │
└────────────────────────────────────────────────────────┘
```

### Key Principles
1. **Server supplies, AI reasons:** The MCP server handles deterministic file operations, indexing, link graphs, revisions, and access policies. It never makes subjective judgments. All workflows (triage, morning briefs, daily closes, task reviews) live as Markdown procedures in `vault/_procedures/` and are fetched dynamically by the AI.
2. **Single-machine isolation:** Single local user, single workstation. No sync daemon to race against. Edits made by the AI or typed directly into the markdown files are immediately consistent.
3. **Cross-platform runtime:** Runs natively on macOS and Linux. On Windows, it seamlessly executes within WSL Ubuntu to satisfy `O_NOFOLLOW`/`dir_fd` filesystem traversal safety guarantees required by the security policy.
4. **Secrets boundary:** Passwords, tokens and credentials are stored in full in `vault/reference/_jookoi-secrets.md`. The `_jookoi-` prefix keeps it out of git (repo `.gitignore`), so it stays on this machine. `reference/accounts.md` is committed and holds systems, URLs and usernames only, linking to the secrets file.

---

## Directory Structure

```
├── vault/                         # Plain markdown second-brain vault
│   ├── _AI_INSTRUCTIONS.md        # Core instructions & routing rules served via MCP
│   ├── _procedures/               # Workflow procedures (triage, daily-close, quick-edit, etc.)
│   ├── Templates/                 # Entity templates (person, project, list, reference)
│   ├── Todo.md                    # Active task queues (## Today, ## This week, ## Waiting)
│   ├── Backlog.md                 # Long-term backlog (## Next up, ## Committed, ## Someday)
│   ├── Journal/                   # Daily waking-day notes (YYYY-MM-DD.md)
│   ├── Inbox/                     # Raw capture intake (triaged -> Inbox/_done/)
│   ├── people/                    # Person records
│   ├── projects/                  # Active and parked project pages
│   ├── reference/                 # Standing reference (accounts, health, hardware, howto)
│   └── calendar/                  # Read-only external mirrors for calendar events/tasks
├── jookoi-md-mcp/                 # Patched high-performance Markdown MCP server (Python 3.12+)
│   ├── src/                       # Server implementation (FastMCP, tools, storage)
│   ├── tests/                     # Pytest test suite (755+ tests)
│   └── mcp.env.example            # Environment configuration template
├── viewer/                        # Local web viewer and editor for the vault (Node 26+, see viewer/README.md)
│   ├── server/                    # Dependency-free Node server: file API, search index
│   ├── web/                       # Angular UI
│   └── dist/                      # Built UI, gitignored (npm run viewer:build, or CI artifact)
├── skills/                        # Agent skills for external harness discovery
│   └── jookoi-brain-mcp/          # SKILL.md for Copilot / Gemini / Claude harnesses
├── scripts/                       # Cross-platform utility and test runners
│   ├── run-tests.js               # Cross-platform pytest runner (WSL / native)
│   ├── link-skill.js              # Symlinks skill to ~/.agents/skills/
│   ├── stop-mcp.js                # Process terminator
│   └── paper-trail.js             # CLI wrapper for jookoi-paper-trail
├── _architecture/                 # Repository architecture & work tracking
│   ├── ARCHITECTURE.md            # Comprehensive technical architecture document
│   ├── items.yaml                 # Paper-trail development item store
│   └── plans/                     # Implementation plans and decision history (ADRs)
├── run-mcp.sh                     # Environment-agnostic shell launcher (macOS/Linux/WSL)
├── run-mcp.ps1                    # Native Windows PowerShell launcher
└── package.json                   # Centralized control hub with shortcut commands
```

---

## Prerequisites & Installation

### Prerequisites
- **Windows:** WSL2 with Ubuntu installed and Python 3.12+ inside WSL. Node.js is needed only for npm shortcuts.
- **macOS / Linux:** Python 3.12+. Node.js is needed only for npm shortcuts.

### Setup Steps

1. **Clone or seed the repository:**
   ```bash
   git clone <repo-url>
   cd jookoi-corporate-env-personal-assistant
   ```

2. **Install the Python environment:**
   - *Windows (inside WSL Ubuntu):*
     ```bash
     cd jookoi-md-mcp
     python3 -m venv .venv
     .venv/bin/python -m pip install -e .
     ```
   - *macOS / Linux:*
     ```bash
     cd jookoi-md-mcp
     python3 -m venv .venv
     .venv/bin/python -m pip install -e .
     cd ..
     ```

   `uv` is optional. The Python dependency tree still contains compiled wheels,
   including FastMCP transitive dependencies. A corporate package policy must
   permit those wheels or provide approved builds; a virtual environment does
   not remove that requirement.

3. **Configure environment:**
   Copy `jookoi-md-mcp/mcp.env.example` to `jookoi-md-mcp/mcp.env`:
   ```env
   VAULT_PATH=/path/to/vault
   HOST=127.0.0.1
   PORT=8008
   TRANSPORT=http
   AUDIT_LOG_PATH=audit.log
   TELEMETRY_PATH=telemetry.log
   LOCK_PATH=.locks
   ```

4. **Link the global agent skill:**
   Registers the `corporate-assistant` skill with your local agent harness (`~/.agents/skills/`):
   ```bash
   npm run skill:link
   ```

---

## Starting the MCP Server

Use the centralized npm commands from the root directory:

| Environment | Foreground | Background (Detached) |
|---|---|---|
| **Auto-Detect (Git Bash / macOS / Linux)** | `npm run mcp:start` | `npm run mcp:start:bg` |
| **Windows PowerShell** | `npm run mcp:start:win` | `npm run mcp:start:win:bg` |
| **Direct Shell** | `./run-mcp.sh` | `./run-mcp.sh --bg` |

### Verifying Server Health
Ping the health check endpoint:
```bash
npm run mcp:health
# Returns: {"status":"ok","index_ready":true,"last_reconcile_at":"...","last_reconcile_duration_seconds":0.91}
```

To stop the server:
```bash
npm run mcp:stop
```

---

## AI Client Configuration

Configure your AI assistant to point to the local HTTP endpoint (`http://127.0.0.1:8008/mcp`). No authentication headers or API keys are required for local loopback connections.

### GitHub Copilot CLI (`~/.copilot/mcp-config.json`)
```json
{
  "mcpServers": {
    "vault": {
      "type": "http",
      "url": "http://127.0.0.1:8008/mcp"
    }
  }
}
```

### VS Code Copilot (`.vscode/mcp.json` or `%APPDATA%\Code\User\mcp.json`)
```json
{
  "servers": {
    "vault": {
      "type": "http",
      "url": "http://127.0.0.1:8008/mcp"
    }
  }
}
```

### Gemini CLI / Antigravity (`~/.gemini/config/mcp_config.json`)
```json
{
  "mcpServers": {
    "vault": {
      "serverUrl": "http://127.0.0.1:8008/mcp"
    }
  }
}
```

### Claude Code (`~/.claude/mcp.json`)
```json
{
  "mcpServers": {
    "vault": {
      "type": "http",
      "url": "http://127.0.0.1:8008/mcp"
    }
  }
}
```

---

## Harness Skills

When working outside of this repository checkout, your AI harness needs to know what this second-brain is, when to use it, and what conventions apply. The repository provides two sibling skills under `skills/`:

1. **`jookoi-brain-mcp` (`skills/jookoi-brain-mcp/SKILL.md`)**:
   For environments with native MCP client configuration (Copilot, Gemini CLI, Claude Code). Instructs the assistant how to invoke vault tools, load dynamic procedures via `vault_get_vault_conventions`, and observe waking-day and secret boundaries.

2. **`jookoi-brain-api` (`skills/jookoi-brain-api/SKILL.md`)**:
   For harnesses, subagents, or scripts that cannot configure native MCP client configs. Documents direct HTTP communication with `jookoi-md-mcp` via `POST /mcp` (JSON-RPC `initialize` handshake and `tools/call` over SSE), providing schema references, header requirements, and concrete invocation code in Node.js and Python.

Running `npm run skill:link` symlinks both skills into `~/.agents/skills/`.

Once linked, any agent harness automatically activates the appropriate skill when you ask to:
- Check your daily agenda or get a morning briefing
- Add, close, or reprioritize tasks in `Todo.md` or `Backlog.md`
- Log meeting notes, conversations, or project status updates
- Search your corporate second-brain
- Run daily closes or inbox triage

---

## Centralized Command Reference

Run all operations from the project root via `npm`:

```bash
# MCP Server Controls
npm run mcp:start         # Start server in foreground (cross-platform auto-detect)
npm run mcp:start:bg      # Start server in background
npm run mcp:start:win     # Start server in foreground (PowerShell)
npm run mcp:start:win:bg  # Start server in background (PowerShell)
npm run mcp:stop          # Stop running server process
npm run mcp:health        # Ping health endpoint

# Vault viewer
npm run viewer:start    # Browse, search and edit vault/ at http://localhost:4180
npm run viewer:build    # Rebuild viewer/dist after changing viewer/web
npm run viewer:test     # Run the viewer server tests

# Testing
npm test                  # Run pytest test suite in WSL / native
npm test -- <test_file>   # Run specific test file

# Harness Skills
npm run skill:link        # Link jookoi-brain-mcp and jookoi-brain-api to ~/.agents/skills/

# Paper-Trail (Development Work Tracking)
npm run paper-trail:list  # List active (now) development items
npm run paper-trail:check # Verify schema conformity across managed files
npm run paper-trail:sweep # Check for unrecorded changes vs items.yaml
npm run paper-trail:flush # Archive completed development items
```

---

## Vault Viewer

`viewer/` is a local web page for reading, searching and editing the vault by hand: a folder tree, markdown with mermaid, full-text search, save, rename, move (drag and drop), delete, download as `.md` and print to PDF. It reads and writes the same files the AI clients use, with no server-side database and no login, and binds to `127.0.0.1` only.

```bash
npm run viewer:start      # http://localhost:4180, needs Node 26+
```

Details, the API and the rules the server enforces are in [viewer/README.md](viewer/README.md).

---

## Core Vault Conventions

- **Task format:** `- [ ] task description #calendar ⏫ 📅 YYYY-MM-DD ➕ YYYY-MM-DD` (`➕` created date, `📅` due date, `⏫` priority).
- **Waking day:** Daily journal entries (`Journal/YYYY-MM-DD.md`) span the owner's waking day (wake to sleep). Late-night notes written between midnight and 06:00 belong to the previous calendar day's note.
- **Durable facts:** When a task is marked completed (`vault_complete_task`), extract lasting real-world facts (people met, decisions taken, hardware bought) and record them on canonical pages (`people/`, `projects/`).
- **No bulk generation:** Create notes only when needed. Preserve existing note formatting and wikilinks.

---

## License

Template structure and tooling are released under the MIT License. Upstream base server code is licensed under the MIT License (see `jookoi-md-mcp/LICENSE`).
