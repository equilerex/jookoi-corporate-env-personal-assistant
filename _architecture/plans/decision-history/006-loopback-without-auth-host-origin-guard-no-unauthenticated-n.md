# Decision 006 — Loopback without auth, Host-Origin guard, no unauthenticated network bind

Date: 29-09-2026 02:15

Status: DECIDED

## Problem

A static review of the finished server found three issues:
- The HTTP server runs unauthenticated.
- `HOST` defaulted to `0.0.0.0`, so a launch without `mcp.env` exposed the vault to the LAN.
- FastMCP's Host/Origin guard was off, so a web page could reach the loopback server through DNS rebinding.

Since decision 004, the vault holds credentials in full, which raises the cost of each gap.

## Options considered

- Require an API key for every HTTP start (the reviewer's proposal).
- Keep loopback unauthenticated. Close the LAN and browser paths instead: default to loopback, refuse a non-loopback bind without auth, and turn on the Host/Origin guard.

## Decision

The second option, in `config.py` and `server.py`:
- `HOST` defaults to `127.0.0.1`.
- `Config` raises `ConfigError` when an HTTP transport binds a non-loopback host with no `API_KEY`, `VAULTS_CONFIG` identity or GitHub OAuth.
- `mcp.run(..., host_origin_protection="auto")`. Verified live on 29-09-2026: a foreign `Host` gets 421, a foreign `Origin` gets 403, and normal, `localhost` and same-origin requests get 200. Tests are in `tests/test_config.py`.

## Why not the alternatives

An API key on loopback protects against nothing the other two changes leave open. Any local process running as the owner can read `vault/reference/_jookoi-secrets.md` straight from disk, key or no key. The remaining remote paths are the LAN and browser pages, and the bind rule and the guard close those. A key would add a secret to every client config for no gain. Revisit if the server ever runs as a different OS user from the clients.

## Next step

None.
