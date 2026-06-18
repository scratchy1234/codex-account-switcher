# Onboarding Questions

Use this when the user is setting up the switcher for the first time or when the requested action is ambiguous.

Prefer the current runtime's ask-user-question tool when available. Ask no more than three questions in one turn.

## Preset Set A: First Install

1. **Storage**: Use the default `~/.codex` location, or a custom `CODEX_HOME`?
   - Default `~/.codex` is simplest and works with normal Codex installs.
   - Custom `CODEX_HOME` is safer for testing or a separate workspace.
2. **First account source**: Capture the currently logged-in Codex account, import an existing JSON, or prepare a manual login slot?
   - Capture current login is fastest when Codex is already logged in.
   - Import JSON is best when the user has a saved auth/CPA-style file.
   - Manual login slot is best when no JSON exists yet.
3. **Profile naming**: Use a human profile name and optional slot number?
   - Example profile name: `work-main`.
   - Example slot: `1`.

## Preset Set B: Switching

1. Which profile or slot should become active?
2. Is the current active auth healthy enough to sync before switching?
3. Should Codex be restarted manually after the switch?

If the user is unsure, run `switch --dry-run` first and show only the non-secret preview.

## Preset Set C: Recovery

1. Should rollback restore the latest backup or a specific backup path?
2. If rollback fails, which known-good profile or slot should be used with `--no-sync`?
3. Should the broken current auth be kept as a backup for later inspection?

If the user is unsure, run `rollback --dry-run` first and show only the non-secret preview.

## Boundaries

- Do not ask the user to paste tokens, cookies, API keys, auth headers, or full auth JSON into chat.
- If a JSON file is needed, ask for a local file path.
- If a password or OTP is needed, the user should enter it directly into Codex or the provider page.
