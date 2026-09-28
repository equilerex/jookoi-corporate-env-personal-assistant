# Daily journal notes (`Journal/`)

Raw chronological notes for each workday, named `YYYY-MM-DD.md`.

- A daily note covers the owner's working day. Late work after midnight (a deploy, an incident) belongs to the day it started.
- Written and closed per `procedure:daily-close`, found via `vault_get_periodic_note(period="daily", date="YYYY-MM-DD")`.
- Format: frontmatter with `created`, `type: journal`, `status: active`, then timestamped entries (`- HH:mm <text>`).
