# Codex Account Switcher

[中文说明](README.zh-CN.md)

Portable account profile switching for Codex. Capture the current login, import a saved auth JSON, switch by profile or slot, and roll back safely without pasting credentials into chat.

## Why

Codex stores local login state in an `auth.json` file. If you use multiple Codex accounts on the same machine, switching accounts manually is slow and error-prone. This skill wraps that workflow in a small local CLI with three rules:

- credentials stay on disk;
- every switch creates a rollback backup;
- commands print only non-secret summaries.

## Features

- Capture the current Codex login into a reusable profile.
- Import normal Codex `auth.json` files or CPA-style JSON exports.
- Assign profiles to numeric slots, then switch with one command.
- Prepare a manual login slot when a profile needs to be refreshed by logging in again.
- Roll back to the latest or a specific backup after a bad switch.
- Run isolated tests with a temporary `CODEX_HOME`.
- Use onboarding questions from `references/onboarding.md` when the runtime supports an ask-user-question tool.

## Prerequisites

- macOS, Linux, or another local environment where Codex uses a local `auth.json`.
- Node.js 18 or newer.
- A terminal with read/write access to the Codex config directory.

## Install

Clone the skill into your Codex skills directory:

```bash
git clone https://github.com/scratchy1234/codex-account-switcher \
  ~/.codex/skills/codex-account-switcher
```

If you install it somewhere else, point the skill at that folder:

```bash
export CODEX_ACCOUNT_SWITCHER_SKILL_DIR="/path/to/codex-account-switcher"
```

Verify the install:

```bash
cd ~/.codex/skills/codex-account-switcher
./scripts/run-tests.sh
node scripts/codex-account-switcher.mjs doctor
```

## Quick Start

Capture the account that is currently logged in through Codex:

```bash
node scripts/codex-account-switcher.mjs capture work-main --slot 1 --dry-run
node scripts/codex-account-switcher.mjs capture work-main --slot 1
```

Import another saved JSON:

```bash
node scripts/codex-account-switcher.mjs import-auth-json backup-account ./auth.json --slot 2 --dry-run
node scripts/codex-account-switcher.mjs import-auth-json backup-account ./auth.json --slot 2
```

List saved profiles:

```bash
node scripts/codex-account-switcher.mjs list
```

Switch to a profile or slot:

```bash
node scripts/codex-account-switcher.mjs switch --dry-run 1
node scripts/codex-account-switcher.mjs switch 1
```

If the current live auth may be broken, skip syncing it back before switching:

```bash
node scripts/codex-account-switcher.mjs switch --no-sync <known-good-profile-or-slot>
```

## Recovery

Show backups:

```bash
node scripts/codex-account-switcher.mjs backups
```

Roll back:

```bash
node scripts/codex-account-switcher.mjs rollback --dry-run latest
node scripts/codex-account-switcher.mjs rollback latest
```

Prepare a manual login refresh:

```bash
node scripts/codex-account-switcher.mjs login-slot --dry-run 1
node scripts/codex-account-switcher.mjs login-slot 1
```

After logging in through Codex, run the `after_login=...` command printed by the CLI. For an existing slot, it includes `--replace` so the refreshed login state updates the saved profile.

## Storage Layout

By default, the CLI stores state under `CODEX_HOME`, usually `~/.codex`:

```text
~/.codex/
├── auth.json                         # active Codex auth
└── account-switcher/
    ├── profiles/                     # saved profile auth files
    ├── backups/                      # automatic active-auth backups
    ├── profiles.json                 # profile names and slots
    ├── active-profile                # last switched profile
    └── last-backup                   # latest rollback target
```

Use a temporary `CODEX_HOME` when testing:

```bash
CODEX_HOME="$(mktemp -d)" node scripts/codex-account-switcher.mjs doctor
```

## Safety Boundaries

- Do not paste tokens, cookies, API keys, auth headers, full env values, or full `auth.json` contents into chat.
- Ask for local file paths when importing JSON.
- Use `--dry-run` before overwriting profiles, switching accounts, preparing login slots, or rolling back.
- Keep at least one known-good profile or backup.
- Restart Codex manually after switching if the running app keeps the previous login in memory.

## CLI Reference

```text
codex-account-switcher init
codex-account-switcher doctor
codex-account-switcher list
codex-account-switcher current
codex-account-switcher capture <profile> [--slot <number>] [--replace] [--dry-run]
codex-account-switcher import-auth-json <profile> <json-file-or-folder> [--slot <number>] [--replace] [--dry-run]
codex-account-switcher switch [--no-sync] [--dry-run] <profile-or-slot>
codex-account-switcher login-slot [--dry-run] <profile-or-slot>
codex-account-switcher backups
codex-account-switcher rollback [--dry-run] [latest|backup-path]
codex-account-switcher path
codex-account-switcher questions
```

## FAQ

**Does this upload auth data anywhere?**

No. It reads and writes local files only.

**Can it refresh expired logins automatically?**

No. If a provider invalidates a token, log in manually and capture the profile again.

**What is `--no-sync` for?**

It prevents the current live auth from being copied back into its saved profile before switching. Use it for recovery when the current auth may be corrupted or expired.

**Can I test it without touching my real Codex login?**

Yes. Set `CODEX_HOME` to a temporary directory before running commands.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=scratchy1234/codex-account-switcher&type=Date)](https://star-history.com/#scratchy1234/codex-account-switcher&Date)

## License

MIT
