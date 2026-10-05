# Vault viewer

A local web page for browsing, searching and editing a folder of markdown files, with mermaid diagrams. It reads and writes the plain files on disk. There is no database, no login and no sync layer. Agents edit the same files through their harness, and the viewer is for the owner reading, searching and making deliberate manual edits.

It is self-contained: the folder it shows is a start-up argument, it imports nothing from the rest of this repo, and it works on any folder of `.md` files. Delete `viewer/` and nothing else changes.

## Run it

Needs Node 26 or newer (`engines.node`). `dist/` is not committed: run `npm install && npm run build` in `viewer/` once, or download the `viewer-dist` artifact from the latest CI run.

```bash
node viewer/server/index.js --root vault            # from the repo root
npm run viewer:start                                # same thing, from the repo root
node server/index.js --root ../vault --port 4180    # from viewer/
```

Then open http://localhost:4180. The default port is 4180 (`--port` or `VIEWER_PORT`). The folder can also come from `VIEWER_ROOT`.

The server binds `127.0.0.1` only and rejects any request whose `Host` header is not `localhost` or `127.0.0.1` on that port. It has no authentication, because it is meant for the owner's own machine. Do not bind it to another address.

## What it does

- **Browse.** A folder tree of every visible file. Dotfiles, symlinks and `node_modules` are hidden.
- **Read.** Markdown with GFM tables and task lists, highlighted code and mermaid diagrams. Links between notes work as relative links, root-absolute links (`/folder/note.md` means from the root folder) and wikilinks (`[[Page]]`, `[[folder/Page]]`, `[[Page#Heading]]`, `[[Page|text]]`). Links never change style, and one to a missing note opens a "Path not found" page.
- **Tree filter.** The sidebar box filters the file tree by file and folder name (diacritics ignored), plus documents whose content matches. Matches keep their ancestors open; clearing restores the tree as it was.
- **Layout.** Drag the edge of the sidebar to resize it (double-click resets, arrow keys work when focused). Sidebar width and the editor view mode (edit, split, view-only) are remembered in the browser. View-only uses the full width.
- **Search.** The header box, right of the title, runs full-text search and replaces the content area with the results until cleared. Full-text search over note names, headings and body, ranked, with highlighted snippets and diacritics ignored (`opetaja` finds `Õpetaja`). Every word must match, `"quoted phrases"` match only when adjacent, and the last word matches as a prefix.
- **Edit.** A plain text editor with split, editor-only and preview-only views (one button steps through them). Save, new note, new folder, rename, move (button or drag-and-drop, including a drop strip for the top level) and delete. The last write wins: there is no conflict check, so avoid editing the same file in two places at once.
- **Other files.** Text files (`.json`, `.ts`, `.txt` and anything that reads as UTF-8, up to 2 MB) open in the editor with no preview. Binary files such as PDFs and images show a card with Open in new tab and Download.
- **Export.** `.md` downloads the editor text. `PDF` opens the print dialog. The printed page gets a line under the first heading with the name, title, department and the date and time of printing, set in the profile dialog (gear in the sidebar footer, stored in `viewer.config.json`, git-ignored).
- **Refresh.** The refresh button re-reads the tree, the open file and the active search without losing the rest of the screen state. The viewer does not watch the folder, so changes made by an agent show up after a refresh.

## Develop

```bash
npm install                            # in viewer/
node server/index.js --root ../vault   # terminal 1: the API on 4180
npm run dev                            # terminal 2: ng serve, proxies /api to 4180
npm test                               # server tests (path safety, write API, search)
npm run test:web                       # Angular unit tests
npm run build                          # builds dist/ (gitignored, CI builds it too)
```


## Layout

```
viewer/
├── server/            # Node server, no runtime dependencies, plain JavaScript (ESM)
│   ├── index.js       # HTTP, Host check, routes, static files
│   ├── notes.js       # tree, reading files, file kinds, raw streaming
│   ├── files.js       # create, save, rename, move, delete
│   ├── paths.js       # path safety for every client path
│   ├── profile.js     # name, title, department
│   └── search/        # in-memory index: tokenizer, BM25 ranking, snippets
├── web/               # Angular app (reused from the old md-archive UI)
├── shared/            # type declarations shared by server contract and web
└── dist/              # built UI served by the server
```

## API

Paths are folder-relative with `/` separators and travel as the `path` query parameter.

| Method and route | Does |
|---|---|
| `GET /api/notes/tree` | folder tree |
| `GET /api/notes/document?path=` | a file: `kind` (`markdown`, `text`, `binary`), `size`, `content` |
| `GET /api/notes/raw?path=` | the file as it is. `&download=1` forces a download |
| `GET /api/notes/search?query=&limit=` | ranked results with snippets |
| `PUT /api/notes/document?path=` | save `{ content }` |
| `POST /api/notes/documents` and `/folders` | create `{ name, folderId }` or `{ name, parentId }` |
| `PATCH /api/notes/{documents,folders}/rename?path=` | `{ name }`, returns the item at its new path |
| `PATCH /api/notes/{documents,folders}/move?path=` | `{ folderId }` or `{ parentId }`, `null` is the top level |
| `DELETE /api/notes/document?path=` and `/folders?path=` | delete |
| `GET`, `PUT /api/config` | the profile |

Write requests must be `application/json`.

## Rules the server enforces

- Every path is resolved against the real folder and rejected if it lands outside it, including through a symlink or junction. Also rejected: `\`, `:`, NUL bytes, drive prefixes, reserved Windows names and trailing dots or spaces.
- A name that matches a sibling ignoring case is rejected, because Windows and macOS treat those as one file. Renaming `todo.md` to `Todo.md` is allowed.
- A note name without an extension gets `.md`. Names starting with a dot are rejected, since the tree hides them.
- Saves go through a temp file and a rename, and keep the file's line endings and byte order mark. Transient Windows file locks are retried.
- A folder holding hidden files or links (for example `.git`) cannot be deleted from the viewer.

## Not included

No authentication, no HTML sanitizing of rendered notes, no file watcher, no multi-user editing, no embeds (`![[file]]`), and the icon and text fonts load from Google, so icons show as words without internet.
