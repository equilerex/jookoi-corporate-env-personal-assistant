# vault viewer

Session: 02-10-2026 00:04, revised after the Opus review. Status: done 02-10-2026. Built as planned except where the deviations below say otherwise. The frontmatter block, self-hosted fonts and wikilink embeds were left out. Tracked as item xp65 Vault MD viewer: self-contained viewer/ folder over plain md files.

## Context

A local web UI for browsing and editing a folder of markdown files with mermaid diagrams. It is a plain markdown viewer: it does not interpret vault conventions, instructions or procedures. Agents edit the files directly through their harness, so the viewer is for the owner reading, searching and making deliberate manual edits. Reference app: `D:\repos\Serenity\JooKoi-md-archive`, whose UI already works and is reused. Why a fresh self-contained folder instead of extending it: decision 007.

Constraints:

- Self-contained `viewer/` folder. The markdown folder path is configuration. It imports nothing from the rest of the repo and works on any markdown folder.
- Runs on any machine that has Node: native Windows is the target, macOS must also work, commands runnable from Git Bash. No WSL, no Unix-only APIs, no platform-specific code paths.
- Ships with a built `dist/` committed, so running it needs only Node, no `npm install` or Angular build. File size of `dist/` is not a concern.
- Plain `.md` files are the only store. No SQLite, no sync layer.
- Local only, bound to loopback (decision 006). No auth. Output is not sanitized and CSP is not set: the owner runs it locally on their own files.
- Last write wins. There is one human and one agent, rarely at the same time, so no conflict detection, no file watcher and no live push to the browser.

## Stack

- `web/`: the existing Angular app, copied and adjusted (see `2026-10-02-md-archive-adaptation-to-vault-files.md`). Angular Material stays, since the UI is built on it.
- `server/`: a Node server with no runtime dependencies, plain JavaScript so there is nothing to compile. It owns everything touching the disk: the file API, the search index and any later server-side feature. The browser never reads files. Serves `dist/` and a JSON API. Replaces NestJS.
- Editor: the existing modal textarea editor with explicit Save, Delete and Move actions. No autosave, no rich editor. Unsaved edits are lost on navigation, as before.
- Node floor: 26, set as `engines.node` in `viewer/package.json`. Chosen by the owner so the current stable line is used and the machine does not get GitHub or npm warnings about an outdated Node. The server uses nothing newer than Node 20 APIs, so the floor is a policy choice, not a technical need. The dev machine currently has 24.19.0 and needs upgrading to run it.
- Host check: the server binds `127.0.0.1` and rejects requests whose `Host` header is not `localhost` or `127.0.0.1`, which is enough to stop DNS rebinding.

## Vault access rules

Kept small on purpose.

- Every client path is resolved against the vault root and rejected if the result is outside it. Also rejected: `\`, `:`, NUL, drive prefixes and trailing dots or spaces in a segment.
- Only `.md` files are listed and editable. Create and rename enforce the `.md` extension on documents.
- Writes use a temp file in the same folder, then rename, so a crash never leaves a half-written note. If the rename fails with a transient error on Windows (`EPERM`, `EBUSY`), retry a few times before returning an error. Temp files are named with a prefix the tree and index skip.
- Line endings and a BOM are preserved on save, so editing a note in the browser does not rewrite its whole diff.
- Save writes the path it was given. If the file was moved or deleted meanwhile, it is recreated there. Accepted.
- A name that matches an existing sibling case-insensitively is rejected on create, rename and move, except when renaming an item to a case-only variant of its own name.

## Search

Requirement: search the content of files, not just titles. The old app does not have it.

Design: an in-memory index in the server, no external engine. The folder is small, so a full build takes milliseconds. The index is rebuilt for any file whose mtime or size changed, checked with a stat scan at the start of each search request, so there is no watcher and results are never stale. The server's own writes update the index directly.

- Tokenizing: split the original text on letters and digits (`/[\p{L}\p{N}]+/gu`), then lowercase and fold diacritics on each token so `õ`, `ä`, `ü` match their plain forms. Each token keeps its original start and end offsets, so snippet highlighting is exact and phrase matches use token positions.
- Fields indexed separately with fixed weights: file name, headings, body. A match in a name or heading ranks above a body match.
- Ranking: BM25 over those fields. Prefix matching on the last term so results appear while typing. All terms must match. A quoted phrase matches exactly.
- Results show the note path, a snippet around the best match with the hit highlighted, and the heading the hit sits under.
- No query filters in the first version.

Out of scope: embeddings and semantic search, fuzzy typo matching, stemming. Revisit stemming if inflected words are missed in real use. If the folder grows past a few thousand notes, swap the index for SQLite FTS5 behind the same `search(query)` interface. The interface is the part to keep stable.

## Build order

1. Scaffold `viewer/` with `web/` and `server/`. Pin `engines.node` to 26.
2. Server skeleton: config (folder path, port), loopback bind, Host check, static `dist/` with an `index.html` fallback for client routes (a route ending in `.md` must still return the app), path-safety helper with tests.
3. Read API: tree and note content. Frontend tree and markdown view, reused from md-archive.
4. Search index and `GET /api/search`, then the search UI with snippets. Tests on tokenizing, diacritics, ranking, and name-over-body ordering.
5. Write API: save, new note, rename, delete, move. The editor modal and drag-and-drop wired to it. The client navigates to the path the server returns after a rename or move.
6. A Refresh button that reloads the tree. Optionally poll the tree every 30 minutes.
7. Optional: Obsidian-style `[[wikilinks]]`, if cheap once the file index exists (see the adaptation plan).
8. Build `dist/` with a fixed `<base href="/">`, commit it, document the start command in `viewer/README.md`, and add the folder to `ARCHITECTURE.md`.

## Implementation deviations

<!-- Added once the build diverges from what this plan said. Future reads reconcile
     against this section, not just the sections above. -->

The detailed record of what shipped and why it differs is the deviations section of `2026-10-02-md-archive-adaptation-to-vault-files.md`. The ones that change this plan:

- Every visible file is listed, not only `.md`. Text files open in the editor, binary files only download or open in a tab. Search still indexes markdown only.
- No `generated: true` read-only rule and no `_jookoi-*` hiding: the viewer treats every file alike and does not read vault conventions.
- Temp files are dot-prefixed (`.viewer-tmp-*`), which the tree hides.
- Search has no query filters and no tag handling. The index is refreshed by a stat scan at the start of each search, with no watcher and no timer.
- The API takes the file id as a `path` query parameter.
- Node floor is 26. Delete is a real delete after a confirmation, with no trash.
- Added beyond the plan: refresh, profile dialog and print header, download and PDF buttons, wikilinks, root-absolute link resolution, a drop strip for the top level, one view-mode button.
