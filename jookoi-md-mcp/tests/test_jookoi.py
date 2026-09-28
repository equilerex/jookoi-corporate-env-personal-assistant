"""JooKoi patch 0002: section targeting, lean reads, task filters, sectioned
conventions, annotations, telemetry and the assistant tools."""

from __future__ import annotations

import asyncio
import json
from datetime import date

import pytest

import jookoi_md_mcp.config as cfg_mod
from jookoi_md_mcp import jookoi, server

TODAY = date.today().isoformat()

TODO = """## Today

- [ ] Call the plumber ➕ 2026-09-20
- [ ] Buy filters 📅 2020-01-01 ➕ 2026-09-20

## This week

- [ ] Write the report ➕ 2026-09-21
  - sub step one

## Waiting

- [ ] Anna: send the photos ➕ 2026-09-22

## Done

- [x] Old thing ✅ 2026-09-01
"""

QUESTIONS = """# Questions

## 2026-09-25

- [ ] **First question?** context

## 2026-09-25

- [ ] **Second question?** context
"""

POLICY = """# Vault instructions

Preamble line about the owner.

## Layout

Layout text.

## Formats

Formats text.
"""


@pytest.fixture
def served_vault(vault_factory, monkeypatch):
    def _make(files: dict[str, str] | None = None):
        index = vault_factory(files)
        monkeypatch.setattr(server, "_indices", {cfg_mod.get_config().default_vault_name: index})
        return index

    return _make


def _read(path, tmp_path):
    return (tmp_path / path).read_text(encoding="utf-8")


# ── Section targeting and errors ─────────────────────────────────────────────


def test_section_accepts_markdown_heading_prefix(served_vault, tmp_path):
    served_vault({"Todo.md": TODO})
    server.append_to_note_tool("Todo.md", "- [ ] New one", section="## Waiting")
    assert "- [ ] New one" in _read("Todo.md", tmp_path).split("## Done")[0].split("## Waiting")[1]


def test_missing_section_lists_existing_headings(served_vault):
    served_vault({"Todo.md": TODO})
    with pytest.raises(ValueError) as exc:
        server.append_to_note_tool("Todo.md", "x", section="Tomorrow")
    message = str(exc.value)
    assert "'Today'" in message and "'Waiting'" in message and "without '#'" in message


def test_duplicate_heading_warns_and_occurrence_targets_last(served_vault, tmp_path):
    served_vault({"Questions.md": QUESTIONS})
    first = server.append_to_note_tool("Questions.md", "- [ ] **A?**", section="2026-09-25")
    assert "occurs 2 times" in first["meta"]["warning"]
    last = server.append_to_note_tool("Questions.md", "- [ ] **B?**", section="2026-09-25", occurrence=-1)
    assert "warning" not in last.get("meta", {})
    text = _read("Questions.md", tmp_path)
    assert text.index("**A?**") < text.index("**Second question?**") < text.index("**B?**")


def test_write_denied_names_writable_paths(served_vault, monkeypatch):
    monkeypatch.setenv("WRITE_PATHS", "Todo.md,people/")
    served_vault({"Todo.md": TODO})
    with pytest.raises(Exception) as exc:
        server.write_note_tool("Home.md", "hi", create_only=True)
    assert "Writable: Todo.md, people/" in str(exc.value)


def test_patch_text_miss_points_at_whitespace_variant(served_vault):
    served_vault({"n.md": "alpha   beta gamma\n"})
    with pytest.raises(ValueError) as exc:
        server.patch_note_text_tool("n.md", find="alpha beta", replace="x")
    assert "whitespace-insensitive match exists at line 1" in str(exc.value)


# ── Writes don't echo, no-ops are reported, links are checked ────────────────


def test_committed_write_returns_counts_not_diff(served_vault):
    served_vault({})
    result = server.write_note_tool("new.md", "one\ntwo\n", create_only=True)
    assert "diff" not in result["data"]
    assert result["data"]["lines_added"] == 2


def test_identical_write_reports_unchanged(served_vault):
    served_vault({"n.md": "same\n"})
    rev = server.read_note_tool("n.md")["revision"]
    result = server.write_note_tool("n.md", "same\n", expected_revision=rev)
    assert result["meta"]["action"] == "unchanged"


def test_dry_run_still_shows_diff(served_vault):
    served_vault({"n.md": "a\n"})
    rev = server.read_note_tool("n.md")["revision"]
    result = server.write_note_tool("n.md", "b\n", dry_run=True, expected_revision=rev)
    assert "diff" in result["data"]


def test_unresolved_wikilink_warns(served_vault):
    served_vault({"people/anna.md": "Anna", "n.md": "x\n"})
    result = server.append_to_note_tool("n.md", "Met [[anna]] and [[Nobody Here]] ![[pic.png]]")
    warning = result["meta"]["warning"]
    assert "'Nobody Here'" in warning and "anna" not in warning and "pic.png" not in warning


# ── Reads ────────────────────────────────────────────────────────────────────


def test_read_defaults_to_lean_content(served_vault):
    served_vault({"Todo.md": TODO})
    result = server.read_note_tool("Todo.md")
    assert result["meta"]["mode"] == "content"
    assert set(result["data"]) == {"content", "frontmatter"}
    assert "full" in result["meta"]["hint"]
    assert result["revision"].startswith("sha256:")


def test_read_one_section(served_vault):
    served_vault({"Todo.md": TODO})
    result = server.read_note_tool("Todo.md", section="Waiting")
    assert result["data"]["section"].startswith("## Waiting")
    assert "Anna" in result["data"]["section"] and "Done" not in result["data"]["section"]
    assert result["revision"].startswith("sha256:")


def test_read_many(served_vault):
    served_vault({"a.md": "A", "b.md": "B"})
    result = server.read_note_tool(paths=["a.md", "b.md", "missing.md"])
    notes = {n["path"]: n for n in result["data"]["notes"]}
    assert notes["a.md"]["content"].strip() == "A"
    assert "revision" in notes["b.md"]
    assert "error" in notes["missing.md"]


def test_search_snippets_name_their_heading(served_vault):
    served_vault({"Todo.md": TODO})
    result = server.search_notes_tool("photos")
    snippet = result["data"]["items"][0]["snippets"][0]
    assert snippet["heading"] == "Waiting"


# ── Tasks ────────────────────────────────────────────────────────────────────


def test_get_tasks_by_root_file_section_query_and_limit(served_vault):
    served_vault({"Todo.md": TODO, "people/x.md": "- [ ] Elsewhere task"})
    root = server.get_tasks_tool(path="Todo.md")
    assert {t["source"] for t in root["data"]["items"]} == {"Todo.md"}
    today = server.get_tasks_tool(path="Todo.md", section="Today")
    assert [t["section"] for t in today["data"]["items"]] == ["Today", "Today"]
    found = server.get_tasks_tool(query="PLUMBER")
    assert len(found["data"]["items"]) == 1
    limited = server.get_tasks_tool(limit=1)
    assert limited["meta"]["truncated"] is True and limited["meta"]["total"] == 5


def test_add_task_formats_and_places_without_blank_line(served_vault, tmp_path):
    served_vault({"Todo.md": TODO})
    result = server.add_task_tool("Todo.md", "Today", "Pay rent", due="2026-10-01", priority="high")
    line = f"- [ ] Pay rent ⏫ 📅 2026-10-01 ➕ {TODAY}"
    assert result["data"]["task"] == line
    assert result["meta"]["action"] == "task_added"
    assert f"➕ 2026-09-20\n{line}\n\n## This week" in _read("Todo.md", tmp_path)


def test_add_task_into_empty_section(served_vault, tmp_path):
    served_vault({"B.md": "## Next up\n\n## Someday\n"})
    server.add_task_tool("B.md", "Next up", "Plan trip", added="2026-09-20")
    assert _read("B.md", tmp_path) == "## Next up\n\n- [ ] Plan trip ➕ 2026-09-20\n\n## Someday\n"


def test_add_task_flags_duplicates_until_forced(served_vault, tmp_path):
    served_vault({"Todo.md": TODO})
    before = _read("Todo.md", tmp_path)
    result = server.add_task_tool("Todo.md", "Today", "call the plumber")
    assert result["meta"]["action"] == "duplicate_suspected"
    assert result["data"]["candidates"][0]["source"] == "Todo.md"
    assert _read("Todo.md", tmp_path) == before
    forced = server.add_task_tool("Todo.md", "Today", "call the plumber", force=True)
    assert forced["meta"]["action"] == "task_added"


def test_add_task_ignores_checklists_on_other_pages(served_vault):
    served_vault({"Todo.md": TODO, "lists/packing.md": "- [ ] Pay rent"})
    result = server.add_task_tool("Todo.md", "Today", "Pay rent")
    assert result["meta"]["action"] == "task_added"


def test_index_wait_covers_cold_start(vault_factory, monkeypatch):
    import threading

    from jookoi_md_mcp.domain.index import IndexBuildingError

    index = vault_factory({"a.md": "x"})
    index._ready = False
    monkeypatch.setenv("INDEX_WAIT_SECONDS", "0")
    with pytest.raises(IndexBuildingError):
        index.get_all_notes()
    monkeypatch.setenv("INDEX_WAIT_SECONDS", "5")
    threading.Timer(0.3, index.mark_ready).start()
    assert index.get_all_notes() == {"a.md"}


def test_add_task_rejects_markers_in_text(served_vault):
    served_vault({"Todo.md": TODO})
    with pytest.raises(ValueError, match="plain task text"):
        server.add_task_tool("Todo.md", "Today", "Pay rent 📅 2026-10-01")


def test_complete_task_moves_block_to_top_of_done(served_vault, tmp_path):
    served_vault({"Todo.md": TODO})
    result = server.complete_task_tool("Todo.md", "Write the report", done_date="2026-09-25")
    assert result["data"]["task"] == "- [x] Write the report ➕ 2026-09-21 ✅ 2026-09-25"
    text = _read("Todo.md", tmp_path)
    done = text.split("## Done")[1]
    assert done.index("Write the report") < done.index("Old thing")
    assert "  - sub step one" in done
    assert "Write the report" not in text.split("## Done")[0]


def test_complete_task_creates_done_and_rejects_ambiguity(served_vault, tmp_path):
    served_vault({"F.md": "- [ ] Anna: photos ➕ 2026-09-01\n- [ ] Anna: call ➕ 2026-09-01\n"})
    with pytest.raises(ValueError, match="2 open tasks"):
        server.complete_task_tool("F.md", "Anna")
    server.complete_task_tool("F.md", "Anna: call", done_date="2026-09-25")
    assert _read("F.md", tmp_path).endswith("## Done\n\n- [x] Anna: call ➕ 2026-09-01 ✅ 2026-09-25\n")


def test_move_task_across_files(served_vault, tmp_path):
    served_vault({"Todo.md": TODO, "Backlog.md": "## Next up\n\n- [ ] Existing ➕ 2026-09-01\n"})
    result = server.move_task_tool("Todo.md", "Write the report", "Next up", to_path="Backlog.md")
    assert result["meta"]["action"] == "task_moved" and result["data"]["to_revision"]
    backlog = _read("Backlog.md", tmp_path)
    assert backlog.endswith("- [ ] Write the report ➕ 2026-09-21\n  - sub step one\n")
    assert "Write the report" not in _read("Todo.md", tmp_path)


def test_briefing(served_vault):
    served_vault({"Todo.md": TODO, "Questions.md": QUESTIONS})
    data = server.get_briefing_tool()["data"]
    assert [t["text"] for t in data["today"]] == ["Call the plumber", "Buy filters"]
    assert data["overdue"][0]["text"] == "Buy filters"
    assert len(data["waiting"]) == 1
    assert len(data["open_questions"]) == 2
    assert data["open_task_counts"]["Todo.md"] == 4


def test_briefing_ignores_dated_tasks_outside_planning_files(served_vault):
    from datetime import date, timedelta

    soon = (date.today() + timedelta(days=1)).isoformat()
    past = (date.today() - timedelta(days=3)).isoformat()
    served_vault({
        "Todo.md": f"## Today\n\n## This week\n\n- [ ] Pay rent 📅 {soon}\n",
        "lists/creative-projects.md": f"## Committed\n\n- [ ] Finish the lamp 📅 {soon}\n",
        "reference/me/events.md": f"- [ ] mani test 📅 {soon}\n",
        "projects/events/fest/2025.md": f"- [ ] pack tent 📅 {past}\n",
    })
    data = server.get_briefing_tool()["data"]
    assert sorted(t["text"] for t in data["due_soon"]) == ["Finish the lamp", "Pay rent"]
    assert data["overdue"] == []
    assert [t["source"] for t in data["dated_elsewhere"]] == [
        "projects/events/fest/2025.md", "reference/me/events.md"]


def test_briefing_events_and_date_range_filter(served_vault):
    from datetime import date, timedelta

    today = date.today()
    d = lambda n: (today + timedelta(days=n)).isoformat()
    served_vault({
        "calendar/events/party-a1.md": f"---\ntitle: Party\ngoogleId: a1\ndate: {d(0)}T21:00:00+02:00\nend: {d(0)}T23:00:00+02:00\nlocation: Poolen\nstatus: confirmed\n---\n",
        "calendar/events/dentist-b2.md": f"---\ntitle: Dentist\ngoogleId: b2\ndate: {d(1)}T09:30:00+02:00\nstatus: confirmed\n---\n",
        "calendar/events/later-c3.md": f"---\ntitle: Later\ngoogleId: c3\ndate: {d(5)}T10:00:00+02:00\n---\n",
        "calendar/events/orphaned/gone-d4.md": f"---\ntitle: Gone\ngoogleId: d4\ndate: {d(0)}T10:00:00+02:00\n---\n",
        "calendar/events/archive/old-e5.md": f"---\ntitle: Old\ngoogleId: e5\ndate: {d(-3)}\n---\n",
    })
    events = server.get_briefing_tool()["data"]["events"]
    assert [e["title"] for e in events] == ["Party", "Dentist"]
    assert events[0]["location"] == "Poolen" and events[0]["start"].startswith(d(0) + "T21:00")
    past = server.query_notes_tool(
        folder="calendar/events",
        frontmatter_filter={"date": {"$gte": d(-3), "$lt": d(-2)}},
    )["data"]["items"]
    assert [i["path"] for i in past] == ["calendar/events/archive/old-e5.md"]


def test_list_entities(served_vault):
    served_vault({
        "people/anna.md": "---\ntype: person\nstatus: active\naliases: [Annie]\n---\nx",
        "projects/p.md": "---\ntype: project\n---\nx",
    })
    items = server.list_entities_tool(type="person")["data"]["items"]
    assert items == [{"path": "people/anna.md", "title": "anna", "type": "person", "status": "active", "aliases": ["Annie"]}]


# ── Conventions ──────────────────────────────────────────────────────────────


def test_conventions_index_sections_procedures_and_all(served_vault):
    served_vault({"_AI_INSTRUCTIONS.md": POLICY, "_procedures/triage.md": "Triage steps"})
    index = server.get_vault_conventions_tool()["data"]
    assert index["sections"] == ["Layout", "Formats"]
    assert index["procedures"] == ["procedure:triage"]
    assert "Preamble line" in index["preamble"] and "procedure:triage" in index["hint"]
    some = server.get_vault_conventions_tool(section=["## formats", "procedure:triage"])["data"]["sections"]
    assert some == {"Formats": "## Formats\n\nFormats text.", "procedure:triage": "Triage steps"}
    assert server.get_vault_conventions_tool(section="all")["data"]["conventions"] == POLICY
    with pytest.raises(ValueError, match="Valid: 'Layout', 'Formats', 'procedure:triage', 'all'"):
        server.get_vault_conventions_tool(section="Nope")


def test_core_instructions(served_vault):
    served_vault({"_AI_INSTRUCTIONS.md": POLICY, "_procedures/triage.md": "x"})
    text = jookoi.core_instructions(POLICY)
    assert "Preamble line about the owner." in text
    assert "'Layout', 'Formats'" in text and "'procedure:triage'" in text
    assert "Layout text." not in text
    assert len(text) < 4000


# ── Annotations and telemetry ────────────────────────────────────────────────


def test_every_tool_keeps_its_output_schema():
    """ChatGPT stopped loading the tool list when middleware stripped these
    (25-09-2026). Every tool returns the dict envelope, so every tool has one."""
    tools = asyncio.run(server.mcp.list_tools())
    missing = [t.name for t in tools if not t.to_mcp_tool().model_dump(by_alias=True).get("outputSchema")]
    assert not missing, f"tools without outputSchema: {missing}"


def test_every_tool_is_annotated():
    tools = asyncio.run(server.mcp.list_tools())
    by_name = {t.name: t.annotations for t in tools}
    assert all(a is not None and a.readOnlyHint is not None for a in by_name.values())
    assert by_name["read_note_tool"].readOnlyHint is True
    assert by_name["get_briefing_tool"].readOnlyHint is True
    assert by_name["write_note_tool"].readOnlyHint is False
    assert by_name["write_note_tool"].destructiveHint is True
    assert by_name["append_to_note_tool"].destructiveHint is False


def _call(name, args):
    from fastmcp import Client

    async def go():
        async with Client(server.mcp) as client:
            return await client.call_tool(name, args, raise_on_error=False)

    return asyncio.run(go())


def test_telemetry_records_success_error_and_feedback(served_vault, tmp_path, monkeypatch):
    log = tmp_path.parent / f"{tmp_path.name}-telemetry.jsonl"
    monkeypatch.setenv("TELEMETRY_PATH", str(log))
    served_vault({"Todo.md": TODO})
    _call("read_note_tool", {"path": "Todo.md"})
    _call("append_to_note_tool", {"path": "Todo.md", "content": "x", "section": "Nope"})
    _call("report_issue_tool", {"summary": "section errors unclear"})
    entries = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]
    ok, err, feedback, feedback_call = entries
    assert feedback_call["tool"] == "report_issue_tool"
    assert ok["tool"] == "read_note_tool" and ok["outcome"] == "ok" and ok["bytes"] > 0
    assert ok["args"] == {"path": "Todo.md"}
    assert err["outcome"] == "error" and "not found" in err["error"]
    assert err["args"]["content"] == {"len": 3}
    assert feedback["kind"] == "feedback" and feedback["summary"] == "section errors unclear"


def test_task_pages_say_how_to_continue(served_vault):
    served_vault({"Todo.md": TODO})
    first = server.get_tasks_tool(limit=2)
    assert first["meta"]["has_more"] is True and first["meta"]["next_offset"] == 2
    last = server.get_tasks_tool(limit=2, offset=3)
    assert len(last["data"]["items"]) == 1 and "has_more" not in last["meta"]


def test_schema_carries_enums_and_rejects_bad_input(served_vault):
    served_vault({"Todo.md": TODO})
    tools = {t.name: t for t in asyncio.run(server.mcp.list_tools())}
    read_schema = tools["read_note_tool"].parameters["properties"]
    assert read_schema["mode"]["enum"] == ["content", "full", "outline", "rendered"]
    assert tools["write_note_tool"].annotations.idempotentHint is True
    bad = _call("add_task_tool", {"path": "Todo.md", "section": "Today", "text": "x", "priority": "urgent"})
    assert bad.is_error
    bad_due = _call("add_task_tool", {"path": "Todo.md", "section": "Today", "text": "x", "due": "tomorrow"})
    assert bad_due.is_error


def test_tool_prefix_renames_tools_and_messages(tmp_path):
    """Registration happens at import, so this runs a fresh interpreter."""
    import subprocess
    import sys

    (tmp_path / "vault").mkdir()
    script = (
        "import asyncio\n"
        "from jookoi_md_mcp import jookoi, server\n"
        "names = {t.name for t in asyncio.run(server.mcp.list_tools())}\n"
        "print('vault_read_note' in names, 'read_note_tool' in names,\n"
        "      'vault_list_vaults' in names, 'vault_search_notes' in jookoi.core_text())\n"
    )
    env = {
        **__import__("os").environ,
        "VAULT_PATH": str(tmp_path / "vault"),
        "LOCK_PATH": str(tmp_path / "locks"),
        "TOOL_PREFIX": "vault_",
        "DISABLE_TOOLS": "list_vaults_tool",
    }
    out = subprocess.run([sys.executable, "-c", script], env=env, capture_output=True, text=True, timeout=60)
    assert out.stdout.split()[-4:] == ["True", "False", "False", "True"], out.stderr[-2000:]


def test_telemetry_off_without_path(served_vault, monkeypatch):
    monkeypatch.delenv("TELEMETRY_PATH", raising=False)
    served_vault({"Todo.md": TODO})
    assert server.report_issue_tool("x")["data"] == {"recorded": False}


# ── log series, CRLF headings, denial reasons ────────────────────────────────

MOOD = """---
type: log
---
# Mood

- 2024-01-05 mood=good mood_score=4 source=[[Journal/2024-01-05]]
- 2024-03-01 09:30 mood=meh mood_score=3 energy=2.5 note="slow start"
prose line that is not an observation
- 2024-07-01 mood=rad mood_score=5 source=[[Journal/2024-07-01|July]]
"""


def test_log_series_range_fields_and_types(served_vault):
    served_vault({"lists/logs/mood.md": MOOD})
    data = server.get_log_series_tool("lists/logs/mood.md", start="2024-01-01", end="2024-06-30")["data"]
    assert [i["date"] for i in data["items"]] == ["2024-01-05", "2024-03-01"]
    assert data["items"][0] == {
        "date": "2024-01-05", "mood": "good", "mood_score": 4, "source": "Journal/2024-01-05",
    }
    assert data["items"][1]["time"] == "09:30" and data["items"][1]["energy"] == 2.5
    assert data["items"][1]["note"] == "slow start"
    assert data["fields_available"] == ["energy", "mood", "mood_score", "note", "source"]
    only = server.get_log_series_tool("lists/logs/mood.md", fields=["mood_score"])["data"]
    assert only["items"][2] == {"date": "2024-07-01", "mood_score": 5}


def test_log_series_limit_reports_truncation(served_vault):
    served_vault({"lists/logs/mood.md": MOOD})
    data = server.get_log_series_tool("lists/logs/mood.md", limit=1)["data"]
    assert data["count"] == 1 and data["matched"] == 3 and data["truncated"] is True


def test_patch_section_matches_heading_in_crlf_note(served_vault, tmp_path):
    served_vault({"note.md": "## Goal\r\ntext\r\n\r\n## Carry forward\r\nold\r\n"})
    server.patch_note_tool("note.md", "Carry forward", "new", mode="append")
    assert "new" in _read("note.md", tmp_path)


def test_write_denials_say_why(served_vault, monkeypatch):
    import jookoi_md_mcp.config as cfg_mod
    from jookoi_md_mcp.storage.policy import ProtectedPathError, WritePermissionError
    from jookoi_md_mcp.tools.write import _storage

    served_vault({"note.md": "x"})
    monkeypatch.setenv("WRITE_PATHS", "projects/,rules.md")
    monkeypatch.setenv("DENY_WRITE_PATHS", "rules.md")
    cfg_mod._config = None
    storage = _storage()
    with pytest.raises(WritePermissionError, match="WRITE_PATHS allow-list"):
        storage.resolve_write("Journal/2026-09-25.md")
    with pytest.raises(ProtectedPathError, match="DENY_WRITE_PATHS rule 'rules.md'"):
        storage.resolve_write("rules.md")
