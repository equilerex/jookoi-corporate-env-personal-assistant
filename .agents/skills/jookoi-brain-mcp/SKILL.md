---
name: jookoi-brain-mcp
description: Access, manage, and query the user's corporate second-brain vault through its local HTTP MCP server (jookoi-md-mcp). Use when the user asks to look up or add a task, check today's agenda, take quick notes, log a project update, record a meeting or person detail, search the vault, or file captures in a corporate environment.
metadata:
  author: Joosep Kõivistik
  last_updated: 2026-09-28
---

# Corporate Personal Assistant (`jookoi-brain-mcp`)

This skill connects AI coding assistants and agent harnesses to the user's single-machine corporate second-brain (`vault/`). The vault runs on plain Markdown files in a self-contained local workspace without external desktop applications or cloud sync, exposed locally via the `jookoi-md-mcp` HTTP server.

## Connection & Runtime

- **Server URL**: `http://127.0.0.1:8008/mcp` (Streamable HTTP SSE)
- **Health Check**: `http://127.0.0.1:8008/health` (HTTP 200, returns index status)
- **Auth**: None required (local loopback daemon)
- **If offline**: Start the server via `npm run mcp:start:bg` (or `./run-mcp.sh --bg` / `run-mcp.ps1 -Background` in the repo root).

## MCP Client Setup

Add to the client's MCP configuration:

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

Applicable configuration files:
- GitHub Copilot CLI: `~/.copilot/mcp-config.json`
- VS Code Copilot: `.vscode/mcp.json` or `%APPDATA%\Code\User\mcp.json`
- Gemini CLI / Antigravity: `~/.gemini/config/mcp_config.json`
- Claude Code: `~/.claude/mcp.json`

## Workflow & Conventions

The MCP server deterministic layer enforces storage, paths, revisions, and audits. Domain intelligence and procedures live in the vault itself.

1. **Lookups & Briefings**:
   - `vault_get_briefing`: Summary of open tasks (`Todo.md`), upcoming calendar events, and recent notes.
   - `vault_get_tasks(filter="today")`: Active tasks in `Todo.md` (`## Today`, `## This week`).
   - `vault_search_notes(query="...")`: Full-text search across all markdown notes.
   - Lookups require no special preamble or convention calls.

2. **Writes & Task Management**:
   - `vault_add_task`: Appends `- [ ] text ➕ YYYY-MM-DD` to `Todo.md` or `Backlog.md`.
   - `vault_complete_task`: Marks completed with `✅ YYYY-MM-DD` and moves to the top of `## Done`. Extract and persist durable facts (people met, decisions made, purchases, project steps) to their canonical notes in `people/`, `projects/`, etc.
   - `vault_write_note` / `vault_patch_note_text`: Modifies living pages using optimistic concurrency (`expected_revision`).

3. **Loading Dynamic Procedures**:
   Before executing structured workflows, fetch the authoritative rules dynamically via `vault_get_vault_conventions`:
   - Quick note / fact / errand: `vault_get_vault_conventions(section=["procedure:quick-edit"])`
   - Daily note entries & close: `vault_get_vault_conventions(section=["procedure:daily-close"])`
   - Filing unformatted text / inbox: `vault_get_vault_conventions(section=["procedure:triage", "all"])`
   - Vault formatting rules: `vault_get_vault_conventions(section=["procedure:vault-syntax"])`
   - Morning brief: `vault_get_vault_conventions(section=["procedure:morning-brief"])`

4. **Waking-Day Convention**:
   - Daily notes in `Journal/YYYY-MM-DD.md` follow the owner's waking day (wake to sleep), not midnight to midnight.
   - Entries logged between 00:00 and ~06:00 belong to the previous date note if the owner has not slept yet.

5. **Secrets & Security Boundary**:
   - Store credentials in full, exactly as given, only in `reference/_jookoi-secrets.md` (untracked by git).
   - Every other note is committed: refer to a credential there as `(in [[_jookoi-secrets#<heading>]])`, never with its value.

6. **Assistant Mindset**:
   - Act as an intelligent assistant, not a passive filing clerk.
   - Apply reasoned judgment to keep lists clean, consolidate duplicate notes, reword vague tasks, and report concise summaries of changes made.
