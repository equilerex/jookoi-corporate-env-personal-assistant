# Decision 005 — Use standard Python installation and polling for the vault server

Date: 29-09-2026 00:28

Status: DECIDED

## Problem

Corporate environments may block unapproved executable installers and native Python wheels. The server launcher previously required `uv`, and the dependency list included a file watcher that the code can run without.

## Options considered

Keep `uv` and the event watcher; use standard `venv`/`pip` with polling; or replace FastMCP and its dependency tree to aim for a pure Python runtime.

## Decision

Use standard `venv`/`pip` for installation and run the installed console script from `.venv`. Remove the optional `watchdog` dependency; the existing polling fallback handles vault changes. Keep FastMCP and the libraries used by active server features.

## Why not the alternatives

`uv` is an extra executable with no runtime need. `watchdog` has no required feature role. Replacing FastMCP would change the protocol and auth stack substantially; the current dependency tree still includes compiled wheels such as `pydantic-core`, `cryptography`, and `watchfiles`, so this decision does not claim a binary-free deployment.

## Next step

Install from a corporate-approved Python package source and validate the WSL runtime there. If policy rejects every native wheel, assess a smaller protocol stack as a separate task.
