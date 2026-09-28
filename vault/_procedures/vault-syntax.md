# Vault syntax conventions

Supplement to `_AI_INSTRUCTIONS.md`: the markdown conventions around its rules — wikilinks, frontmatter, tags, callouts, task formatting. These are the standardized conventions this vault's notes and the MCP server's link/query tools rely on for portability and deterministic parsing. Where generic advice conflicts with the rules in `_AI_INSTRUCTIONS.md` (routing, schema, dates, provenance), the rules win.

## Page shape

Frontmatter holds stable, queryable identity; the body holds readable knowledge. Use only the fields and values the Frontmatter Schema accepts, keep one spelling and type per value (`active`, never `Active` or `in-progress`), and don't add `date modified`, title copies or plugin fields no template or query needs.

```yaml
---
type: epic
status: active
areas:
  - engineering
created: 2026-09-25
aliases:
  - Short name
---
```

The filename is the title: don't open the body with an H1 that repeats it. Project pages keep `## State` (one current paragraph), `## Blockers` (what stops progress, and on whom), `## Next` (the concrete next action), `## Decisions` and a dated `## Log` (`- YYYY-MM-DD HH:mm what changed`). Keep headings stable: other notes link to them (`[[Project#Next]]`) and section reads and writes target them.

## Links

- Link where the relation matters: `[[Person]]`, `[[folder/Page]]`, `[[Page|shown text]]`, `[[Page#Heading]]`.
- Before adding a link, find the exact target (`vault_search_notes` with `field="filename"`, `vault_resolve_alias`). A write that adds a link to no existing note returns a warning.
- An index or queue page links to canonical pages; it never copies their paragraphs.
- Aliases are for genuine alternate names, not keywords.
- Block IDs (`^stable-id`) only when a heading can't carry the reference.
- An intentionally standalone page is not an orphan to "fix": check backlinks (`vault_get_backlinks`) first.

## Tags, fields, callouts, embeds

- Tags are retrieval dimensions, not every noun: reuse existing tags and namespaces (`vault_list_all_tags`).
- Inline fields (`key:: value`) only for an existing query or a clearly repeated data shape.
- Callouts (`> [!note]`, `[!warning]`, `[!question]`) for short reader guidance, never instead of the task, question or provenance formats.
- Embeds (`![[Note#Section]]`, `![[image.png]]`) only when the target exists and reuse helps. Code, stack traces and implementation detail stay in their repository; the vault keeps the decision, status, next step and a link.

## Common failure modes

- a second page because the first used a nickname
- a new task in `Today` because it was captured today
- a project summary copied into every related page instead of linked
- a new folder or schema field for one note
- plain dates or lookalike icons where the task format expects `📅 ➕ ⏫ 🔽 ✅`
- deleting outdated facts instead of marking them `(superseded YYYY-MM-DD)`
- a password or token anywhere but `reference/_jookoi-secrets.md` (every other file is committed)
