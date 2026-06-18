# codex-account-switcher

Safely capture, import, switch, and roll back local Codex auth profiles without copying tokens into chat.

## What It Does

```text
Codex auth.json -> reusable local profiles -> numbered slots -> safe switch + rollback
```

A compact local workflow for people who use multiple Codex accounts on one machine:

| Phase | What | Required? |
|-------|------|-----------|
| **Capture** | Save the currently logged-in Codex `auth.json` as a named profile | Optional |
| **Import** | Import a saved Codex auth JSON or CPA-style JSON into a profile | Optional |
| **Switch** | Replace the active Codex auth with a chosen profile or slot | Core |
| **Recover** | Roll back to a previous backup or prepare a manual login slot | Core |

The switcher is designed around one constraint: credentials stay on disk and out of model-visible output. Commands print only non-secret summaries.

## Prerequisites

- Codex using a local `auth.json` file, normally under `~/.codex/auth.json`
- Node.js 18+
- A local terminal with filesystem access to the Codex config directory

## Quick Start

### 1. Install the Skill

Clone directly into your Codex skills directory:

```bash
git clone https://github.com/scratchy1234/codex-account-switcher \
  ~/.codex/skills/codex-account-switcher
```

If you install somewhere else, point the skill at that location:

```bash
export CODEX_ACCOUNT_SWITCHER_SKILL_DIR="/path/to/codex-account-switcher"
```

### 2. Check the Install

```bash
cd ~/.codex/skills/codex-account-switcher
./scripts/run-tests.sh
node scripts/codex-account-switcher.mjs doctor
```

### 3. Capture the Current Login

Use this after you are already logged in through Codex:

```bash
node scripts/codex-account-switcher.mjs capture work-main --slot 1 --dry-run
node scripts/codex-account-switcher.mjs capture work-main --slot 1
node scripts/codex-account-switcher.mjs list
```

### 4. Import a Saved JSON

```bash
node scripts/codex-account-switcher.mjs import-auth-json backup-account ./auth.json --slot 2 --dry-run
node scripts/codex-account-switcher.mjs import-auth-json backup-account ./auth.json --slot 2
```

The importer accepts normal Codex auth JSON and CPA-style JSON with token fields. It stores a normalized profile without printing credential contents.

### 5. Switch and Recover

```bash
node scripts/codex-account-switcher.mjs switch --dry-run 1
node scripts/codex-account-switcher.mjs switch 1
```

If a switch goes wrong:

```bash
node scripts/codex-account-switcher.mjs backups
node scripts/codex-account-switcher.mjs rollback --dry-run latest
node scripts/codex-account-switcher.mjs rollback latest
```

If the current live auth may be broken, skip syncing it back before switching:

```bash
node scripts/codex-account-switcher.mjs switch --no-sync <known-good-profile-or-slot>
```

## How It Works

The CLI keeps profile state under your `CODEX_HOME`:

```text
~/.codex/
├── auth.json                         # active Codex auth
└── account-profiles/
    ├── profiles/                     # saved profile auth files
    ├── backups/                      # automatic active-auth backups
    └── manifest.json                 # profile names, slots, and active pointer
```

Before changing `auth.json`, the switcher creates a timestamped backup. Read-only commands such as `doctor`, `list`, and `backups` do not create profile state. Mutating commands support `--dry-run` so you can preview what would happen first.

## Onboarding Flow

The skill includes `references/onboarding.md` with preset questions for first install, switching, and recovery. In Codex runtimes that provide an ask-user-question tool, the skill can use those questions as a lightweight setup wizard.

## Safety Boundaries

- Do not paste tokens, cookies, API keys, auth headers, full env values, or full `auth.json` contents into chat.
- Use local file paths for JSON imports.
- Use `--dry-run` before overwriting an occupied profile, preparing a login slot, switching, or rolling back when unsure.
- Keep at least one known-good profile or backup before experimenting.
- Restart Codex manually after a switch if the running app keeps the previous login in memory.

## Project Structure

```text
codex-account-switcher/
├── README.md                        # public setup guide
├── LICENSE                          # MIT license
├── SKILL.md                         # Codex skill entry point
├── agents/
│   └── openai.yaml                  # UI metadata
├── references/
│   └── onboarding.md                # setup/switch/recovery question flow
└── scripts/
    ├── codex-account-switcher.mjs   # portable account switcher CLI
    └── run-tests.sh                 # isolated CODEX_HOME test suite
```

## FAQ

**Q: Does this upload my auth data anywhere?**
A: No. It only reads and writes local files under your Codex config directory.

**Q: Can it refresh expired logins?**
A: No. It stores and switches login state. If a provider invalidates a token, log in manually and capture the profile again.

**Q: What is `--no-sync` for?**
A: It prevents the current live auth from being copied back into its saved profile before switching. Use it when the current auth may be corrupted, expired, or not worth preserving.

**Q: Can I test without touching my real Codex login?**
A: Yes. Set `CODEX_HOME` to a temporary directory, then run the commands there.

## License

MIT
