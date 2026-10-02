# md-archive adaptation to vault files

Session: 02-10-2026 00:20, revised after the Opus review. Status: done 02-10-2026. Left out: the frontmatter block (tracked as a parked item), self-hosted fonts (cut by the owner), the export of the 2 old md-archive documents (not wanted). Part of item xp65 Vault MD viewer: self-contained viewer/ folder over plain md files. Overall design, search and write rules are in `2026-10-02-vault-viewer.md`. This plan covers what to take from `D:\repos\Serenity\JooKoi-md-archive` and how its model changes.

## Context

md-archive stores folders and documents as rows in SQLite, addressed by id, behind a NestJS API and a login. The viewer stores them as `.md` files and folders on disk. The UI works today and is reused as is wherever possible, not rebuilt. What changes is the storage under it and the removal of auth and encryption.

Data migration is not a real task. The old database holds 2 folders and 2 documents, one of them an encrypted note stored as ciphertext. That is test data. Nothing is migrated by default. A one-off export is an optional last step.

## Model change

| md-archive | viewer |
|---|---|
| Node id is a random id | Node id is the folder-relative path with `/` separators, for example `projects/foo.md` |
| Folder and document names cannot collide (`foo` vs `foo.md`) | The filesystem decides. A folder `foo` and a file `foo.md` are different names, so folder notes work with no rule. Documents keep `.md` in their path and URL. Names that differ only by case are rejected, since Windows treats them as the same |
| URL segments are XOR plus base64url obfuscated | Plain percent-encoded path segments |
| `createdAt` and `updatedAt` columns | `updatedAt` from file mtime. `createdAt` dropped, since file birth time is unreliable across git checkouts |
| `encrypted` flag, `CryptoService`, `encrypt-util.html` | Dropped |
| Rename and move change a row | Filesystem renames. The server returns the new path and the client navigates to it. Any stored tree state keyed by the old path (expanded folders in localStorage) is re-keyed |
| Delete cascades through the foreign key | Real delete after a confirmation. A folder confirmation shows the number of files inside, counting every file, not only `.md`. No trash, since git history covers committed files |

`shared/src/models.d.ts` carries over with `id` meaning path, `folderId` becoming `folderPath`, `parentId` becoming a parent path, and `encrypted` removed from the document and request types. `createdAt` is removed.

## Keep, rewrite, drop

Keep, copied into `viewer/web/` and adjusted:

- The whole UI: `notes-page`, `tree-node`, `notes-tree.store`, `markdown-preview`, `markdown.service`, the editor modal, split preview, mobile toggle, breadcrumbs, sorting and collapse state. Angular Material and its CDK usage stay.
- Drag-and-drop in the tree. A move is one filesystem rename. The unfinished polish from md-archive's backlog (hover-only drop highlight, root drop zone) is done in the same pass.
- Mermaid and highlight.js rendering.
- Styles: only `features/notes/styles/_markdown-rendering.scss` is referenced. `app/markdown-rendering.scss` is unused and not copied.

Rewrite or change:

- `notes-api.service.ts` against the path-based API.
- The server, from scratch as the plain Node server in the viewer plan.
- `notes-page` behaviour that assumed a database: it creates a folder named `A bucket` when the root is empty, and picks the first root folder as the default for new notes. Both change to using the folder root as the default. Check for and remove the clipboard read when creating a note. Name new notes from the H1 as today, but let the user edit the name in the modal.
- Navigation after rename and move, which used the old id, uses the path returned by the server.
- `MarkdownService.parse` removes every line starting with `import `, an MDX leftover that eats normal prose. Removed.
- Material Icons and Google Fonts load from `fonts.gstatic.com` and `fonts.googleapis.com`. Self-host them from npm packages, so icons still render when the machine has no internet.

Drop:

- All of `api/` (NestJS, `node:sqlite`, DTOs, entities, `database.provider.ts`).
- `features/auth`, `auth.service`, `auth.interceptor`, `auth.guard`, `crypto.service`, `encrypt-util.html`.

## Additions

- Frontmatter: a leading `---` block is stripped from the rendered body and shown as a small collapsible block of key and value pairs.
- Relative links: `[text](../other/foo.md)` and `[text](foo.md#heading)` resolve against the current note's folder and navigate inside the viewer. A link to a missing file renders muted. `http(s)` links open in a new tab.
- Optional, only if cheap: Obsidian-style `[[Note]]`, `[[folder/Note]]`, `[[Note|text]]` and `[[Note#Heading]]`, resolved by file name against the server's file list. Unresolved ones render as plain text. Not a requirement, and not built if it needs more than a small markdown extension and one lookup endpoint.
- Task checkboxes (`- [ ]`) render as checkboxes through GFM. Toggling them from the viewer is out of scope.
- Content search replaces the title-only search. See the viewer plan. The result list is a new component, because the old one filtered the tree by id.

Not built: any warning about links that break after a move. The viewer does not track links. Moving a note can break relative links elsewhere, and fixing them is left to the owner or an agent.

## Build order

1. Scaffold `viewer/web/` by copying the md-archive UI verbatim into one state, so the diff against the original stays readable. Strip auth and crypto and get it compiling against stubbed API calls.
2. Rework `shared/src/models.d.ts` and `notes-api.service.ts` to the path-based model. Point it at the real server once the viewer plan's read API exists.
3. Apply the rewrite list above: default-folder behaviour, parse fix, navigation by returned path, self-hosted fonts.
4. Add the frontmatter block and relative-link resolution to `markdown.service`.
5. Wire the editor, rename, move, drag-and-drop and delete to the write API.
6. Replace the title search with the content search UI.
7. Optional: wikilinks, then the export of the 2 old documents. The encrypted one is exported as its ciphertext, not decrypted.

## Moves

Moving a file or folder is a `rename` on the server.

- The moved item's path changes, and so does every descendant's when a folder moves. The client reloads the tree and, if the open note was inside the moved item, navigates to its new path.
- The target must not contain a sibling with the same name, compared case-insensitively. A move into the item's own subtree is refused.
- The search index is updated in the same call.

## Implementation deviations

<!-- Added once the build diverges from what this plan said. Future reads reconcile
     against this section, not just the sections above. -->

- Stage 1 (02-10-2026): `viewer/` uses one `package.json` at its root with `web/` as a plain source folder. md-archive's npm workspaces and `web/package.json` were not carried over, since there is no second workspace once `api/` is gone.
- Stage 1: model field names `parentId` and `folderId` were kept, now holding a parent folder path, instead of renaming to `folderPath`. Renaming touched many call sites for no behaviour change. `createdAt` and `encrypted` were removed from `shared/src/models.d.ts` as planned.
- Stage 1: `angular.json` outputs straight to `viewer/dist/` (no `browser/` subfolder), the form the server will serve. The pinned `<base href="/">` is already in `web/src/index.html`, copied from git HEAD of md-archive, not its mangled working-tree copy.
- Stage 1: `NotesApiService` is a read-only in-memory stub until stage 2. Tree row hrefs now `encodeURIComponent` each path segment, since segments are plain names, not base64url.
- Stage 1: dependencies were first copied from md-archive at Angular 21, which was already a major behind. Moved to current versions (Angular and Material ~22.2.1, TypeScript ~6.0.3 because Angular 22 does not accept TypeScript 7, mermaid 12, eslint 10, vitest 5). `npm install` also had pulled in the unrelated packages `build`, `ng`, `npx` (the old deprecated `npx` package, source of the audit's 66 vulnerabilities) and `@angular/build` 22 against an Angular 21 tree. They were not in the copied manifest. Removed. Rule going forward: check `npm view <pkg> version` before pinning, and install with plain `npm install`, never `npm install` followed by tool names.
- Stage 1: `viewer/tsconfig.json` no longer sets `baseUrl`, which TypeScript 6 deprecates (build error TS5101). The `@shared/models` path mapping stays and resolves relative to the tsconfig. Not silenced with `ignoreDeprecations`, since that fails again on TypeScript 7.
- Stage 1 verified: the Angular build passes on Angular 22 and TypeScript 6 (output in `viewer/dist/`).
- Stage 2 (written, not yet run): the server is ESM (`viewer/server/package.json` sets `type: module`) so the Angular manifest stays untouched. Ids contain `/`, so the API takes them as a `path` query parameter (`GET /api/notes/document?path=`, writes in stage 3 follow the same shape), not as URL segments. Default port is 4180. Temp files in stage 3 will be dot-prefixed (`.viewer-tmp-*`), which the tree already hides, instead of a `_jookoi-` prefix. Document URLs now keep the `.md` extension (`toDocumentPathSegment` in `notes-page.ts` returns the name), so a folder `foo` and a note `foo.md` never share a URL.
- Stage 2: `ng serve` needs the API, so `web/src/proxy.conf.json` and the `serve.options.proxyConfig` entry in `angular.json` were restored, pointing at `127.0.0.1:4180` with `changeOrigin: true` (the server's Host check rejects any other Host). Dev flow: run the server and `ng serve` together. Without the proxy the dev server answers `/api` with `index.html` and the client fails with "Unexpected token '<'".
- Stage 4 (02-10-2026, built ahead of stage 3 at the owner's request): content search is in `viewer/server/search/` (`tokenize.js`, `index.js`) with `GET /api/notes/search?query=`. Fields name 5, headings 3, body 1, BM25, AND, quoted phrases, prefix on the last term, diacritics folded per token, stat-scan reconcile at the start of each search. The client gets `SearchResults` (`components/search-results/`) which replaces the tree while a query is typed, with a 150 ms debounce and a sequence guard against out-of-order responses. The old title-filter search was removed from `notes-tree.store.ts` (`setSearchResults`, `filterTree`, `visibleTree` filtering). `SearchResult` in `shared/src/models.d.ts` swapped `snippet?: string` for `heading?` and `snippetParts?: { text, hit }[]`, so the client highlights through template bindings, with no HTML strings. Stage 3 writes must call the index's refresh path, which already happens on the next search, so no extra hook is needed.
- Tests: `node --test "server/*.test.js" "server/search/*.test.js"` from `viewer/` (note that `node --test server` runs `index.js` and fails). 37 tests pass.
- Stage 3 (02-10-2026): write API in `viewer/server/files.js`, routed in `index.js`: `POST /api/notes/folders|documents`, `PUT /api/notes/document?path=`, `PATCH /api/notes/{folders|documents}/{rename|move}?path=`, `DELETE /api/notes/document|folders?path=`. JSON bodies only (415 otherwise). Rename and move return the item at its new path (`id`), and the client continues from it (`afterMove` in `notes-page.ts`, which also re-keys the expanded-folders entry in localStorage through `NotesTreeStore.remapSavedIds`). Calls made while building:
  - The owner wants non-markdown files visible, so the viewer plan's "only `.md` is listed and editable" no longer holds. The tree lists every visible file. Text files (known extensions, or UTF-8 by sniffing, up to 2 MB) open in the editor, binary files get download and open-in-new-tab only. `GET /api/notes/raw?path=` streams a file, inline for pdf and images, plain text for html and svg. Search still indexes markdown only.
  - A new note name with no extension gets `.md`. A renamed note keeps `.md` when the extension is dropped. Other extensions are kept as typed. Names starting with a dot are rejected, since the tree hides them.
  - Save requires an existing parent folder, recreates a file whose own path is gone, refuses binary files, and keeps the file's BOM and line endings. A BOM is stripped from content on read.
  - Delete of a folder is recursive after the client's confirmation, but refused with 409 when the subtree holds dotfiles or links the viewer does not show (for example a `.git`), so the viewer never deletes what it cannot display.
  - Temp files are `.viewer-tmp-<random>` in the target folder, hidden by the tree. Rename and write retry on `EPERM`, `EBUSY`, `EACCES`.
  - Client: the old new-file clipboard read is removed, new notes go into the selected folder or the root (not the first root folder), and opening `/notes` no longer creates an `A bucket` folder.
  - Also built ahead of the client for the backlog items (see the viewer backlog items for the UX batches): `viewer/server/profile.js` with `GET/PUT /api/config`.
- Tests: `node --test "server/*.test.js" "server/search/*.test.js"` from `viewer/`, 76 pass. A curl pass against a scratch copy of the vault covered create, save, case-only rename, move, self-move refusal, content-type refusal, text and binary kinds, raw headers and deletes.
- Backlog batch (02-10-2026, built after stage 3): toolbar Move and Delete buttons (desktop; Move also in the mobile menu), refresh button and profile dialog in the sidebar header, print header under the first `h1` (`ProfileService.printLine`, injected by `injectPrintMeta`, refreshed on `beforeprint`), Download .md, kind-aware panes (text files editor-only, binary files a card with open and download), root-absolute and relative link resolution in `features/notes/utils/link-resolver.ts` with missing links muted and external links in a new tab, relative images through `/api/notes/raw`, `color-scheme: only light` with the dark variable block removed, search clear button no longer overflowing (`.jo-search-input` got `min-width: 0`), `.jo-action-btn` text black. The old `.jo-print-title` block was removed. Checked in Chrome against the live vault: subtitle, print line, link rewriting and in-app navigation, search with highlights and the no-match message, refresh keeping the search, profile dialog. Not checked: Android in dark mode, the binary file card, a text file in the editor, a printed page (no PDF preview available), mobile layout.
- Print header refinement (02-10-2026, owner feedback): the line sits 5 px under the first `h1`, with a faint gray rule 3 px below it, text at 70% opacity. It reads `name - title - department - 2 October 2026 | 02:22`: the date is spelled out in the browser's language and the 24-hour time is set apart in bold with a divider. Defaults in `viewer/server/profile.js` are now title "Expert IT Developer" and department "DWD Engagement Execution" (spelled "Execution", the owner typed "Excecution"). The `Copy` buttons on code blocks are hidden in print. Refresh moved from the sidebar header to the right of the document title in the toolbar, profile settings to a footer button in the sidebar.
- Link behaviour (02-10-2026, owner feedback): links are never restyled or blocked. A link to a note that is not in the tree keeps its normal look and its `/notes/...` URL, and clicking it opens that URL, where the page shows "Path not found". Links the viewer cannot resolve (for example `../../x.md` above the folder root) and outside links are left to the browser. The `jo-link--missing` style is gone.
- Toolbar order (02-10-2026, owner feedback), desktop: view toggle, copy, Move, Delete, Save, then a divider, then Download (download icon and `.md`, or the file's own extension for other files), Print (printer icon and `PDF`) and Refresh at the far right. Profile settings stay in the sidebar footer.
- View mode (02-10-2026, owner feedback): the three view buttons are one button (`cycleViewMode` in `notes-page.ts`). Desktop steps editor, split, preview and the icon shows the current mode with a tooltip naming the next. Phones, which have no split view, switch between editor and preview.
- Scope cut (02-10-2026, owner): self-hosting Material Icons and Inter is dropped. It was never a requirement. The viewer still loads them from Google, so icons show as words when the machine has no internet. Revisit only if that happens on the corporate machine.
- Toolbar grouping (02-10-2026, owner feedback), desktop: icon buttons first (refresh, view mode, copy, Move, Delete), a divider, then the text buttons (Save, download, PDF). On phones the icons are refresh, view mode, copy and the `more_vert` menu, then Save.
- Wikilinks built (02-10-2026, owner asked for them if easy; stage 7 item done). `MarkdownService` has an inline `wikilink` extension for `[[Page]]`, `[[folder/Page]]`, `[[Page#Heading]]` and `[[Page|shown text]]` (not inside code spans). It renders a plain link carrying the target. `decoratePreview` in `notes-page.ts` resolves it with `findWikiTarget` (`utils/link-resolver.ts`) against the file tree: name or path suffix, with or without `.md`, ties go to the current note's folder, then the shallowest path. The resolved wikilink is turned into a root-absolute link, so click handling, `#heading` scrolling and the missing-target behaviour are the ordinary link path. A wikilink naming no file points at `/notes/<name>.md`, which shows "Path not found". Embeds (`![[file]]`) are not supported. Checked in Chrome and with a node run of the lookup.
- Branding (02-10-2026, after close): the viewer's name is "JooKoi-Brain-Vault" (sidebar title, tab title, route title, empty toolbar title) and its logo is `viewer/web/public/assets/logo.svg`, used for the sidebar mark and as the tab icon (SVG first, `favicon.ico` as fallback). The `K` avatar is gone.
