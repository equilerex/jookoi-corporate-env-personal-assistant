from __future__ import annotations

import os

from ..config import get_config
from ..storage import audit as audit_storage
from ..storage.policy import VaultAccessPolicy


def _client() -> dict:
    """Who made the call. An API-key token's client_id is the key itself, so it is
    never logged: it becomes the label "api-key". OAuth calls log the client id and
    the GitHub login. Local stdio calls have no token."""
    try:
        from fastmcp.server.dependencies import get_access_token

        token = get_access_token()
    except Exception:
        return {}
    if token is None:
        return {"client": "stdio"}
    keys = [k.strip() for k in os.environ.get("API_KEY", "").split(",") if k.strip()]
    if token.client_id in keys:
        return {"client": "api-key"}
    out = {"client": token.client_id}
    login = (token.claims or {}).get("login")
    if login:
        out["login"] = str(login)
    # After a GitHub login the token names the user, not the app. The app names itself in
    # the MCP handshake (clientInfo) and in its User-Agent.
    try:
        from fastmcp.server.dependencies import get_context

        info = get_context().session.client_params.clientInfo
        out["app"] = f"{info.name} {info.version or ''}".strip()
    except Exception:
        pass
    try:
        from fastmcp.server.dependencies import get_http_request

        out["user_agent"] = get_http_request().headers.get("user-agent", "")[:160]
    except Exception:
        pass
    return out


def log_write(tool: str, path: str | None, summary: str) -> None:
    """Append one audit entry for a write-tool call. Best-effort: a logging
    failure must never block or fail the write it's recording."""
    try:
        cfg = get_config()
        vault = cfg.resolve_vault_name()
        audit_storage.append_entry(
            cfg.audit_log_path,
            cfg.lock_path,
            tool=tool,
            path=path,
            summary=summary,
            vault=vault,
            extra=_client(),
        )
    except Exception:
        pass


def get_audit_log(
    path: str | None = None,
    tool: str | None = None,
    since: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Query the append-only write-action audit log, most recent first.
    path/tool/since are optional filters (since: ISO timestamp, inclusive)."""
    cfg = get_config()
    vault = cfg.resolve_vault_name()
    policy = VaultAccessPolicy.from_config(cfg)
    canonical_path = policy.resolve_read(path).relative if path is not None else None
    return audit_storage.read_entries(
        cfg.audit_log_path,
        path=canonical_path,
        tool=tool,
        since=since,
        limit=limit,
        vault=vault,
        path_allowed=lambda entry_path: entry_path is None or policy.can_read(entry_path),
    )

