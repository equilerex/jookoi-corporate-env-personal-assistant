# Decision history

Retired MCP-server decisions (001, 005, 006) live in `_architecture/archive/`.

- [002 Decoupling from Obsidian plugins and Meld Encrypt in corporate vault](002-decoupling-from-obsidian-plugins-and-meld-encrypt-in-corpora.md): Eliminates Obsidian app and Meld Encrypt dependencies, routing secrets exclusively to enterprise password managers and treating markdown structures as data contracts.
- [003 Vault instructions rebuilt for corporate work use](003-vault-instructions-rebuilt-for-corporate-work-use.md): why the vault is work-only and how the external corporate draft was corrected (wikilink provenance, Waiting vs Follow-ups, no auto-⏫ on PR reviews).
- [004 Credentials stored in full in a git-ignored vault file](004-credentials-stored-in-full-in-a-git-ignored-vault-file.md): why credential values live in full in `reference/_jookoi-secrets.md` (git-ignored) and never in tracked notes. Supersedes the credentials part of 002.
- [007 Vault viewer is a self-contained viewer/ folder over plain md files](007-vault-viewer-is-a-self-contained-viewer-folder-over-plain-md.md): why the viewer is a self-contained `viewer/` folder reading and writing plain md, instead of an md-archive SQLite/md hybrid.
