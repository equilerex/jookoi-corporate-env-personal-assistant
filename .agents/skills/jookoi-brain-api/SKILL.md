---
name: jookoi-brain-api
description: Access, manage, and query the user's corporate second-brain vault directly through the jookoi-md-mcp HTTP JSON-RPC API without requiring an MCP client configuration. Use when an AI harness, script, or environment lacks native MCP client support and needs to call the backend tools over HTTP (curl, python, node, fetch).
metadata:
  author: Joosep Kõivistik
  last_updated: 2026-09-28
---

# Corporate Personal Assistant API (`jookoi-brain-api`)

This skill enables AI agents, scripts, and automation harnesses to query and update the user's single-machine corporate second-brain (`vault/`) directly via HTTP. It bypasses the need for native MCP client configurations (such as `.vscode/mcp.json` or `mcp_config.json`) by communicating directly with the `jookoi-md-mcp` HTTP JSON-RPC endpoint.

## Server Endpoints & Runtime

- **Base URL**: `http://127.0.0.1:8008`
- **Health Check**: `GET http://127.0.0.1:8008/health` (returns 200 with index status)
- **JSON-RPC Endpoint**: `POST http://127.0.0.1:8008/mcp`
- **Auth**: None required (local loopback daemon)
- **Server Process**: Managed via `npm run mcp:start:bg` or `npm run mcp:stop` in repo root.

## Protocol & Session Flow

The `jookoi-md-mcp` server implements the MCP Streamable HTTP protocol (SSE / JSON-RPC 2.0). Every communication follows a two-step handshake:

### Step 1: Initialize Session

Send an `initialize` JSON-RPC handshake to establish an active session:

```http
POST /mcp HTTP/1.1
Host: 127.0.0.1:8008
Content-Type: application/json
Accept: application/json, text/event-stream

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "direct-api-client",
      "version": "1.0.0"
    }
  }
}
```

**Response**: HTTP 200 SSE stream. Capture the session ID from the response header:
```http
mcp-session-id: <SESSION_ID>
```

### Step 2: Call Tools

Send tool requests with the captured `mcp-session-id` header:

```http
POST /mcp HTTP/1.1
Host: 127.0.0.1:8008
mcp-session-id: <SESSION_ID>
Content-Type: application/json
Accept: application/json, text/event-stream

{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "<tool_name>",
    "arguments": { ... }
  }
}
```

### Step 3: Response Envelope

Responses return as SSE event streams (`event: message\ndata: {...}`). The JSON payload contains:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\":true,\"data\":{...}}"
      }
    ],
    "structuredContent": {
      "success": true,
      "path": "optional/note.md",
      "revision": "sha256:...",
      "data": { ... },
      "meta": { ... }
    }
  }
}
```
All mutations and reads return the standardized envelope: `{ success, path, revision, data, meta }`.

## Tool Interface Reference

### 1. Briefing & Status
- **`vault_get_briefing`**
  - **Params**: `{}`
  - **Returns**: Open tasks from `Todo.md`, due dates, open questions, recent changes.
- **`vault_get_tasks`**
  - **Params**: `{"filter": "today" | "all" | "inbox" | "backlog"}`
  - **Returns**: List of parsed task objects with status, text, and source paths.

### 2. Note Operations
- **`vault_read_note`**
  - **Params**: `{"path": "relative/path.md"}`
  - **Optional**: `{"section": "Heading Name"}`
  - **Returns**: Markdown content, parsed frontmatter, and current `revision` hash.
- **`vault_search_notes`**
  - **Params**: `{"query": "search query"}`
  - **Optional**: `{"mode": "fuzzy" | "exact" | "regex", "limit": 10}`
  - **Returns**: Matched note snippets, paths, and headings.
- **`vault_write_note`**
  - **Params**: `{"path": "relative/path.md", "content": "full markdown body"}`
  - **Optional**: `{"expected_revision": "sha256:...", "create_only": false}`
  - **Returns**: Write confirmation and new revision.
- **`vault_patch_note_text`**
  - **Params**: `{"path": "relative/path.md", "find": "exact string to replace", "replace": "replacement text"}`
  - **Optional**: `{"expected_revision": "sha256:..."}`
  - **Returns**: Patch status, lines added/removed, new revision.

### 3. Task Management
- **`vault_add_task`**
  - **Params**: `{"text": "task text", "target": "today" | "inbox" | "backlog"}`
  - **Action**: Formats `- [ ] text ➕ YYYY-MM-DD` and checks for duplicates before inserting.
- **`vault_complete_task`**
  - **Params**: `{"text": "exact task text to close"}`
  - **Action**: Marks completed with `✅ YYYY-MM-DD` and moves to the top of `## Done`.

### 4. Dynamic Procedures & Conventions
- **`vault_get_vault_conventions`**
  - **Params**: `{"section": ["procedure:quick-edit"]}`
  - **Available sections**:
    - `procedure:quick-edit`: Quick note, errand, or fact capture.
    - `procedure:daily-close`: Daily review and note closing conventions.
    - `procedure:triage`: Inbox triage and dump filing.
    - `procedure:vault-syntax`: Markdown and wikilink conventions.
    - `procedure:morning-brief`: Morning agenda and priority assembly.

## Script / Agent Implementation Example

### Node.js Example
```javascript
const http = require('http');

async function mcpCall(toolName, args = {}) {
  const post = (headers, body) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request('http://127.0.0.1:8008/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...headers
      }
    }, res => {
      let buf = '';
      res.on('data', chunk => { buf += chunk; });
      res.on('end', () => resolve({ headers: res.headers, body: buf }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });

  // Step 1: Handshake
  const init = await post({}, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'api', version: '1.0' } }
  });
  const sessionId = init.headers['mcp-session-id'];

  // Step 2: Call Tool
  const res = await post({ 'mcp-session-id': sessionId }, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: toolName, arguments: args }
  });

  const match = res.body.match(/data:\s*(\{.*\})/);
  if (!match) throw new Error(`Unexpected response: ${res.body}`);
  const payload = JSON.parse(match[1]);
  return payload.result.structuredContent || JSON.parse(payload.result.content[0].text);
}

// Usage:
// const briefing = await mcpCall('vault_get_briefing');
// console.log(briefing);
```

### Python Example
```python
import json
import requests

URL = "http://127.0.0.1:8008/mcp"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}

def call_tool(tool_name: str, arguments: dict = None) -> dict:
    session = requests.Session()
    # Step 1: Initialize
    init_res = session.post(
        URL,
        headers=HEADERS,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "py", "version": "1.0"}},
        },
    )
    session_id = init_res.headers.get("mcp-session-id")

    # Step 2: Call Tool
    call_headers = {**HEADERS, "mcp-session-id": session_id}
    res = session.post(
        URL,
        headers=call_headers,
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": tool_name, "arguments": arguments or {}}},
    )
    # Parse SSE data
    for line in res.text.splitlines():
        if line.startswith("data: "):
            msg = json.loads(line[6:])
            result = msg.get("result", {})
            return result.get("structuredContent") or json.loads(result["content"][0]["text"])
    return {}
```

## Rules & Assistant Conventions

1. **Waking-Day Convention**:
   Daily notes in `Journal/YYYY-MM-DD.md` follow the owner's workday. Entries logged after midnight while still finishing the previous day's work belong to the previous date note.
2. **Secrets & Security Boundary**:
   Store credentials in full, exactly as given, only in `reference/_jookoi-secrets.md` (untracked by git). Every other note is committed: refer to a credential there as `(in [[_jookoi-secrets#<heading>]])`, never with its value.
3. **Optimistic Concurrency**:
   Always pass the `revision` received from a read call as `expected_revision` when calling mutation tools (`vault_write_note`, `vault_patch_note_text`).
4. **Intelligent Execution**:
   Apply reasoned judgment to keep lists organized, deduplicate items, and summarize mutations directly.
