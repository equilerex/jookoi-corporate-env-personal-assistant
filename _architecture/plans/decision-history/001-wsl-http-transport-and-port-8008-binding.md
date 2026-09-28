# Decision 001 — WSL HTTP transport and port 8008 binding

Date: 28-09-2026 21:39

Status: DECIDED

## Problem

1. `obsidian-mcp` requires platform security flags (`O_NOFOLLOW`, `dir_fd`) in `filesystem.py` that native Windows Python lacks, causing `SecureStorageError` on file operations.
2. Running separate stdio processes per client (Copilot CLI, Gemini CLI, VS Code Copilot) triples index build overhead and causes lock file contention on the vault.
3. Default HTTP port 8000 was already bound by an existing local node process (PID 15460).

## Options considered

1. Stdio transport launched via `wsl.exe` separately per client.
2. Kill the process on port 8000 and bind 8000.
3. Bind a dedicated local port (8008) in WSL Ubuntu on loopback `127.0.0.1` and share it across all three clients.

## Decision

Bind a single shared FastMCP HTTP server process inside WSL Ubuntu on `127.0.0.1:8008`, secured with a static Bearer API key. Launch it with `run.sh` / `run-mcp.ps1`.

## Why not the alternatives

- Per-client stdio in WSL wastes memory, triggers 3 independent 17+ second index reconciliations, and causes lock collisions on write operations.
- Killing existing local services on port 8000 disrupts unrelated host tooling; 8008 is completely free and avoids conflicts.

## Next step

Wire Copilot CLI, VS Code Copilot, and Gemini CLI to `http://127.0.0.1:8008/mcp` with the shared Bearer token.
