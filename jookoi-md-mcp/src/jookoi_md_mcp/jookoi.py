"""JooKoi additions (patch 0002): tool annotations, core instructions and
telemetry. Kept in one module so the patch against upstream stays small.
Plan: JooKoi-vault _architecture/plans/implemented/2026-09-25-vault-mcp-ergonomics-and-telemetry.md"""

from __future__ import annotations

import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path

from fastmcp.server.middleware import Middleware, MiddlewareContext
from mcp.types import ToolAnnotations

from .config import get_config
from .storage.locking import acquire_lock

# ── Tool annotations ─────────────────────────────────────────────────────────
# ChatGPT treats a tool without readOnlyHint as a write and asks for
# confirmation on every call, so every tool gets annotations here.

_READ_PREFIXES = ("list_", "read_", "get_", "search_", "find_", "query_", "resolve_", "lint_")
_READ_ONLY_EXTRA = {"create_attachment_token_tool"}  # mints a signed link, changes nothing
_WRITES_DESPITE_PREFIX = {"find_replace_in_vault_tool"}
_IDEMPOTENT_WRITES = {"write_note_tool", "patch_frontmatter_tool", "create_folder_tool"}
_NON_DESTRUCTIVE_WRITES = {
    "append_to_note_tool",
    "create_folder_tool",
    "create_from_template_tool",
    "add_attachment_tool",
    "report_issue_tool",
    "add_task_tool",
}


def annotations_for(name: str) -> ToolAnnotations:
    read_only = (
        name.startswith(_READ_PREFIXES) and name not in _WRITES_DESPITE_PREFIX
    ) or name in _READ_ONLY_EXTRA
    if read_only:
        return ToolAnnotations(readOnlyHint=True, idempotentHint=True, openWorldHint=False)
    return ToolAnnotations(
        readOnlyHint=False,
        destructiveHint=name not in _NON_DESTRUCTIVE_WRITES,
        idempotentHint=name in _IDEMPOTENT_WRITES,
        openWorldHint=False,
    )


def tool_name(base: str) -> str:
    """Registered name for a tool. TOOL_PREFIX=vault_ turns read_note_tool
    into vault_read_note, so the source is clear next to other servers;
    unset keeps upstream names. Messages that name a tool use this too."""
    prefix = os.environ.get("TOOL_PREFIX", "").strip()
    return f"{prefix}{base}" if prefix else f"{base}_tool"


def public_name(function_name: str) -> str:
    return tool_name(function_name.removesuffix("_tool"))


def install_annotations(mcp) -> None:
    """Wrap mcp.tool so every registration gets annotations (by function
    name) and its public name (TOOL_PREFIX)."""
    plain = mcp.tool

    def _fill(fn, kwargs):
        kwargs.setdefault("annotations", annotations_for(fn.__name__))
        kwargs.setdefault("name", public_name(fn.__name__))

    def tool(*args, **kwargs):
        if args and callable(args[0]):
            fn = args[0]
            _fill(fn, kwargs)
            return plain(fn, *args[1:], **kwargs)

        def decorate(fn):
            _fill(fn, kwargs)
            return plain(*args, **kwargs)(fn)

        return decorate

    mcp.tool = tool


# ── Core instructions ────────────────────────────────────────────────────────

_CORE_TEMPLATE = """\
You are connected to the jookoi-md-mcp server.

How to work:
- Lookups need no conventions. Use {search_notes} (snippets name their heading), {get_tasks} (narrow with path, section, query), {read_note} (default mode 'content'; section= reads one heading; paths= reads up to 10 notes).
- Opening a session as the owner's assistant: {get_briefing} returns today's tasks, due items, open questions and recent changes in one call.
- Before any write, load the conventions you need: {get_vault_conventions}(section=[...]). The index is below. Triage or bulk filing: section='procedure:triage'.
- Tasks: {add_task}, {complete_task} and {move_task} format and place task lines for you.
- Every write passes the note's `revision` (from any read) as expected_revision. On revision_conflict, re-read and redo that one write. New notes: create_only=true.
- Section targets are heading text without '#'. If a heading repeats, the result warns; occurrence=-1 targets the last.
- Results: {{success, path, revision, data, meta}}. Read meta.warning and meta.truncated when present. Writes return line counts, not the diff; action 'unchanged' means nothing needed writing.
- jookoi-md-mcp uses the note filename as the title. Don't start a note with an H1 that repeats it.
- If a tool surprises you or these instructions mislead you, call {report_issue} with a one-line summary. It is read to fix the server.
"""

_NAMED_TOOLS = (
    "search_notes", "get_tasks", "read_note", "get_briefing", "get_vault_conventions",
    "add_task", "complete_task", "move_task", "report_issue",
)


def core_text() -> str:
    return _CORE_TEMPLATE.format(**{n: tool_name(n) for n in _NAMED_TOOLS})


def core_instructions(raw: str) -> str:
    from .tools.query import PROCEDURE_PREFIX, list_procedures, split_conventions

    preamble, sections = split_conventions(raw)
    try:
        procedures = list_procedures()
    except Exception:
        procedures = []
    parts = [core_text()]
    if preamble:
        parts.append("# Vault instructions (preamble of _AI_INSTRUCTIONS.md)\n\n" + preamble)
    if sections:
        parts.append("Conventions sections: " + ", ".join(repr(t) for t, _ in sections))
    if procedures:
        parts.append("Procedures: " + ", ".join(repr(PROCEDURE_PREFIX + p) for p in procedures))
    return "\n\n".join(parts) + "\n"


# ── Telemetry ────────────────────────────────────────────────────────────────
# One JSON line per tool call in TELEMETRY_PATH: sizes, timings and error
# shapes, never note content (beyond what an error message quotes).

_ECHO_ARGS = {
    "path", "section", "mode", "folder", "status", "vault", "occurrence", "limit",
    "target_type", "tag", "field", "period", "date", "to_path", "to_section",
}
_MAX_ERROR = 300


def _telemetry_path() -> Path | None:
    value = os.environ.get("TELEMETRY_PATH", "").strip()
    return Path(value) if value else None


def append_telemetry(entry: dict) -> None:
    """Best-effort: telemetry must never fail the call it records."""
    path = _telemetry_path()
    if path is None:
        return
    try:
        entry = {"time": datetime.now(UTC).isoformat(timespec="milliseconds"), **entry}
        line = json.dumps(entry, ensure_ascii=False, default=str) + "\n"
        path.parent.mkdir(parents=True, exist_ok=True)
        lock = acquire_lock(str(path), lock_path=get_config().lock_path)
        try:
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(line)
        finally:
            lock.release()
    except Exception:
        pass


def _client_fields() -> dict:
    try:
        from .tools.audit import _client

        return _client()
    except Exception:
        return {}


def _session_id(context: MiddlewareContext) -> str | None:
    try:
        return context.fastmcp_context.session_id
    except Exception:
        return None


def summarize_args(arguments: dict | None) -> dict:
    out = {}
    for key, value in (arguments or {}).items():
        if key in _ECHO_ARGS and (value is None or isinstance(value, (str, int, float, bool))):
            out[key] = value if not isinstance(value, str) else value[:120]
        else:
            out[key] = {"len": len(json.dumps(value, ensure_ascii=False, default=str))}
    return out


def _response_stats(result) -> dict:
    text = ""
    for block in getattr(result, "content", None) or []:
        text += getattr(block, "text", "") or ""
    structured = getattr(result, "structured_content", None)
    if not text and structured is not None:
        text = json.dumps(structured, ensure_ascii=False, default=str)
    stats = {"bytes": len(text.encode("utf-8"))}
    stats["tokens_est"] = stats["bytes"] // 4
    if getattr(result, "is_error", False):
        stats["outcome"] = "error"
        if isinstance(structured, dict):
            stats["error_type"] = str(structured.get("error") or structured.get("code") or "tool_error")[:80]
            stats["error"] = json.dumps(structured, ensure_ascii=False, default=str)[:_MAX_ERROR]
    if isinstance(structured, dict):
        data = structured.get("data")
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            stats["items"] = len(data["items"])
        meta = structured.get("meta") or {}
        if meta.get("truncated"):
            stats["truncated"] = True
        if meta.get("warning"):
            stats["warning"] = str(meta["warning"])[:_MAX_ERROR]
        if structured.get("success") is False:
            stats["outcome"] = "error"
    if "[Response truncated due to size limit" in text[-400:]:
        stats["capped"] = True
    return stats


class TelemetryMiddleware(Middleware):
    async def on_call_tool(self, context: MiddlewareContext, call_next):
        started = time.perf_counter()
        message = context.message
        entry = {
            "kind": "call",
            "tool": getattr(message, "name", None),
            "args": summarize_args(getattr(message, "arguments", None)),
            "session": _session_id(context),
            **_client_fields(),
        }
        try:
            result = await call_next(context)
        except Exception as exc:
            entry.update(
                outcome="error",
                error_type=type(exc).__name__,
                error=str(exc)[:_MAX_ERROR],
                ms=round((time.perf_counter() - started) * 1000, 1),
            )
            append_telemetry(entry)
            raise
        entry.update(outcome="ok", ms=round((time.perf_counter() - started) * 1000, 1))
        entry.update(_response_stats(result))
        append_telemetry(entry)
        return result


def unresolved_link_warning(text: str | None, index, before: str | None = None) -> str | None:
    """Wikilinks in newly written text that resolve to no note (invented
    links). Links already present in `before` and attachment embeds are
    ignored."""
    if not text:
        return None
    try:
        from .domain.parser import extract_wikilinks

        existing = {wl.target for wl in extract_wikilinks(before)} if before else set()
        missing = []
        for wl in extract_wikilinks(text):
            target = wl.target.strip()
            suffix = Path(target).suffix.lower()
            if not target or target in existing or (suffix and suffix != ".md"):
                continue
            if not index.has_note(target) and target not in missing:
                missing.append(target)
    except Exception:
        return None
    if not missing:
        return None
    return (
        f"Unresolved wikilinks written: {', '.join(repr(m) for m in missing[:10])}. "
        f"Check the target note's exact name ({tool_name('search_notes')} field='filename'), or create it."
    )


def record_feedback(summary: str, details: str = "", tool: str | None = None) -> dict:
    entry = {
        "kind": "feedback",
        "summary": summary.strip()[:500],
        "details": details.strip()[:4000],
        "about_tool": tool,
        **_client_fields(),
    }
    append_telemetry(entry)
    return {"recorded": _telemetry_path() is not None}
