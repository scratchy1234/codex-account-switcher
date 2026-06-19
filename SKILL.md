---
name: codex-account-switcher
description: Portable Codex auth profile switching. Use when a user wants to set up a reusable Codex account switcher on any machine, capture the current Codex login, import a Codex auth or CPA-style JSON file, list profiles, switch profiles, prepare a manual-login slot, rollback a bad switch, or run an onboarding question flow without exposing tokens, cookies, API keys, auth headers, full env, or full auth JSON.
---

# Codex Account Switcher

Use the bundled portable CLI. It stores reusable auth profiles under the user's `CODEX_HOME` and replaces only the active `auth.json` when switching.

## Command

Resolve the script relative to this skill:

```bash
SKILL_DIR="${CODEX_ACCOUNT_SWITCHER_SKILL_DIR:-$HOME/.codex/skills/codex-account-switcher}"
ACCOUNT_SWITCHER="$SKILL_DIR/scripts/codex-account-switcher.mjs"
```

If the skill is installed somewhere else, set `CODEX_ACCOUNT_SWITCHER_SKILL_DIR` to that folder before running commands.

## Safety

- Never print tokens, cookies, API keys, auth headers, full env values, complete `auth.json`, CPA JSON contents, or refresh tokens.
- Use `CODEX_HOME` or `CODEX_AUTH_PATH` when the user wants a non-default Codex profile location.
- Treat `doctor`, `list`, and `backups` as read-only checks; use `init` when the state directory should be created.
- Do not overwrite an occupied profile unless the user explicitly asks for replacement.
- Use `--dry-run` before changing `auth.json`, preparing a login slot, importing into an occupied slot, or rolling back when the user is unsure.
- Prefer `switch --no-sync` only for recovery when the current live auth may be broken.
- Always keep rollback available before changing `auth.json`.

## Onboarding

For first-time setup or ambiguous requests, read `references/onboarding.md`.

If the runtime provides an ask-user-question tool, use it for the preset questions there. If not, ask the same questions in chat. Keep it to at most three questions at once.

## Workflows

### Initialize

```bash
node "$ACCOUNT_SWITCHER" init
node "$ACCOUNT_SWITCHER" doctor
```

### Capture Current Login

Use after the user is already logged in through Codex:

```bash
node "$ACCOUNT_SWITCHER" capture <profile> --slot <number> --dry-run
node "$ACCOUNT_SWITCHER" capture <profile> --slot <number>
node "$ACCOUNT_SWITCHER" list
```

### Import Auth Or CPA-Style JSON

```bash
node "$ACCOUNT_SWITCHER" import-auth-json <profile> <json-file-or-folder> --slot <number> --dry-run
node "$ACCOUNT_SWITCHER" import-auth-json <profile> <json-file-or-folder> --slot <number>
```

The importer accepts ordinary Codex `auth.json` or CPA-style JSON containing token fields. It stores a normalized profile without printing credential contents.

### Switch

```bash
node "$ACCOUNT_SWITCHER" switch --dry-run <profile-or-slot>
node "$ACCOUNT_SWITCHER" switch <profile-or-slot>
```

The command backs up the current `auth.json`, optionally syncs the previously active profile, installs the target profile, and records the new active profile. Restart Codex manually if the app keeps the previous login in memory.

### Manual Login Slot

```bash
node "$ACCOUNT_SWITCHER" login-slot --dry-run <profile>
node "$ACCOUNT_SWITCHER" login-slot <profile>
```

Then ask the user to log in through Codex. After login, run the `after_login=...` command printed by the CLI. For an existing slot, that command includes `--replace` so the refreshed login state updates the saved profile.

```bash
node "$ACCOUNT_SWITCHER" capture <profile> --slot <number> --replace
```

### Recovery

```bash
node "$ACCOUNT_SWITCHER" backups
node "$ACCOUNT_SWITCHER" rollback --dry-run latest
node "$ACCOUNT_SWITCHER" rollback latest
node "$ACCOUNT_SWITCHER" switch --no-sync <known-good-profile-or-slot>
```

## Verification

After installation or edits:

```bash
node --check "$ACCOUNT_SWITCHER"
bash "$SKILL_DIR/scripts/run-tests.sh"
node "$ACCOUNT_SWITCHER" doctor
```

If any command fails, report the failing command and non-secret error summary, then stop.
