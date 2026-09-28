# jookoi-md-mcp

A high-performance Model Context Protocol (MCP) server for Markdown knowledge vaults, engineered for corporate single-workstation environments.

`jookoi-md-mcp` provides AI coding assistants (GitHub Copilot CLI, VS Code Copilot, Gemini CLI / Antigravity, Claude Code) with structured, programmatic access to plain Markdown notes: reading, writing, full-text search, task management, link graph traversal, and audit logging.

It includes three sequential feature layers committed directly into source:
1. `0001-audit-client`: Captures calling client identities into audit logs.
2. `0002-jookoi-ergonomics-telemetry`: Records tool latency, token estimates, and structured outcomes in `telemetry.log`.
3. `0003-denial-reasons-log-series`: Structured policy denial tracking and log series querying.

---

## Architecture & Features

- **Protocol & Transport:** Streamable HTTP SSE (`/mcp`), running by default on `http://127.0.0.1:8008` (unauthenticated for local workstation access).
- **Health Check Endpoint:** `http://127.0.0.1:8008/health` returns index status, last reconcile time, and readiness.
- **Deterministic Operations:** The server enforces path validation, per-file locking (`.locks/`), revision tracking (`expected_revision`), and audit trails (`audit.log`).
- **Rich Markdown Tooling:**
  - Full-text search (exact, regex, fuzzy, and frontmatter-scoped)
  - Duplicate prevention via TF-IDF similarity scoring
  - Frontmatter schema validation against `_AI_INSTRUCTIONS.md`
  - Atomic task operations (`vault_add_task`, `vault_complete_task`, `vault_move_task`)
  - Backlinks, BFS link graph navigation, and orphan detection
  - Visual diagram & drawing support (Canvas, Excalidraw, Kanban, Bases)

---

## Configuration

Server configuration is managed via environment variables in `mcp.env` (copied from `mcp.env.example`):

```env
VAULT_PATH=/path/to/vault
TRANSPORT=http
HOST=127.0.0.1
PORT=8008
WRITE_PATHS=Todo.md,Backlog.md,Follow-ups.md,Questions.md,Journal/,people/,teams/,projects/,reference/,lists/,Inbox/,_meta/LOG.md,_meta/questions-archive.md,_procedures/,_AI_INSTRUCTIONS.md
DENY_READ_PATHS=.trash/
DENY_WRITE_PATHS=.trash/,Templates/,CLAUDE.md,AGENTS.md,GEMINI.md
EXCLUDE_PATHS=.trash/
REQUIRE_WRITE_PRECONDITIONS=true
LOCK_PATH=.locks
AUDIT_LOG_PATH=audit.log
TELEMETRY_PATH=telemetry.log
INSTRUCTIONS_MODE=core
TOOL_PREFIX=vault_
```

---

## Running the Server

Inside the `jookoi-md-mcp/` directory:

```bash
# Create an isolated Python environment and install the server
python3 -m venv .venv
.venv/bin/python -m pip install -e .

# Run server directly
./run.sh
```

From the repository root, you can also use the cross-platform npm scripts:
- `npm run mcp:start` (foreground)
- `npm run mcp:start:bg` (background)
- `npm run mcp:health` (health check)

---

## Running Tests

Run the test suite using `pytest`:

```bash
.venv/bin/python -m pip install pytest pytest-asyncio httpx
.venv/bin/python -m pytest
```

---

## License

MIT License. See [LICENSE](LICENSE).
