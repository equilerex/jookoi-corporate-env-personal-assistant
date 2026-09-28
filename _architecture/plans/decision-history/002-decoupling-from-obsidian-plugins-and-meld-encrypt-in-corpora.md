# Decision 002 — Decoupling from Obsidian plugins and Meld Encrypt in corporate vault

Date: 28-09-2026 21:40

Status: DECIDED

## Problem

The personal vault at `C:\JooKoi-vault` relies on the Obsidian desktop app and community plugins (Meld Encrypt for inline encrypted credentials, Obsidian Tasks formatting, Dataview, Obsidian Sync). In the corporate environment, no Obsidian desktop app or third-party sync is present or permitted. Instructions, procedures, and standing files (`reference/accounts.md`, `_AI_INSTRUCTIONS.md`, `_procedures/triage.md`) explicitly instructed agents to place secrets into Meld Encrypt blocks.

## Options considered

1. Keep Meld Encrypt syntax as text placeholders in markdown files.
2. Require an alternative inline encryption plugin/script.
3. Decouple vault instructions from Meld Encrypt and Obsidian-app tooling entirely; reference external enterprise password managers / secure stores and keep tasks as plain standard markdown checkboxes.

## Decision

Decouple completely:
- No passwords, PINs, tokens, or credentials may be written into vault markdown notes.
- Accounts are recorded as service references and usernames only in `reference/accounts.md`, pointing to the enterprise password manager or secure vault.
- Retain markdown task format (`- [ ] text ...`) and heading structures purely as data contracts for the MCP server (`vault_add_task`, `vault_complete_task`, `vault_get_briefing`), without requiring the Obsidian app.

## Why not the alternatives

- Storing raw credentials or defunct Meld Encrypt blocks without the decrypting plugin leaves sensitive data either locked or exposed in plaintext.
- Enterprise corporate security policy mandates using authorized credential managers (e.g. 1Password/Bitwarden/KeePass), not plaintext files or unsupported encryption blocks.

## Next step

Keep `_AI_INSTRUCTIONS.md`, `_procedures/`, and `AGENTS.md` strictly aligned with the credential manager rule across Repo A and seeded Repo B.
