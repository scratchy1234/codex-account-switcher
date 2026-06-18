#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWITCHER="$SCRIPT_DIR/codex-account-switcher.mjs"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

export CODEX_HOME="$TEST_ROOT/codex-home"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  /usr/bin/grep -q -- "$pattern" "$file" || fail "missing pattern '$pattern' in $file"
}

write_auth() {
  local file="$1"
  local account="$2"
  node - <<'NODE' "$file" "$account"
const fs = require("fs");
const path = require("path");
const [file, account] = process.argv.slice(2);
const auth = {
  auth_mode: "chatgpt",
  tokens: {
    id_token: `test.${account}.id`,
    access_token: `test.${account}.access`,
    refresh_token: `test.${account}.refresh`,
    account_id: account,
  },
};
fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
fs.writeFileSync(file, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
NODE
}

node --check "$SWITCHER"

READONLY_HOME="$TEST_ROOT/readonly-home"
CODEX_HOME="$READONLY_HOME" node "$SWITCHER" doctor >"$TEST_ROOT/doctor-readonly.out"
assert_contains "$TEST_ROOT/doctor-readonly.out" '^state_present=no'
CODEX_HOME="$READONLY_HOME" node "$SWITCHER" list >"$TEST_ROOT/list-readonly.out"
CODEX_HOME="$READONLY_HOME" node "$SWITCHER" backups >"$TEST_ROOT/backups-readonly.out"
[[ ! -e "$READONLY_HOME/account-switcher" ]] || fail "read-only commands created account-switcher state"

node "$SWITCHER" init >"$TEST_ROOT/init.out"
assert_contains "$TEST_ROOT/init.out" '^initialized='

write_auth "$CODEX_HOME/auth.json" "alpha"
node "$SWITCHER" capture alpha-dry --slot 99 --dry-run >"$TEST_ROOT/capture-dry.out"
assert_contains "$TEST_ROOT/capture-dry.out" '^would_capture=alpha-dry'
[[ ! -f "$CODEX_HOME/account-switcher/profiles/alpha-dry/auth.json" ]] || fail "capture --dry-run wrote a profile"

node "$SWITCHER" capture alpha --slot 1 >"$TEST_ROOT/capture-alpha.out"
assert_contains "$TEST_ROOT/capture-alpha.out" '^captured=alpha'

write_auth "$TEST_ROOT/beta.json" "beta"
node "$SWITCHER" import-auth-json beta-dry "$TEST_ROOT/beta.json" --slot 98 --dry-run >"$TEST_ROOT/import-dry.out"
assert_contains "$TEST_ROOT/import-dry.out" '^would_import=beta-dry'
[[ ! -f "$CODEX_HOME/account-switcher/profiles/beta-dry/auth.json" ]] || fail "import-auth-json --dry-run wrote a profile"

node "$SWITCHER" import-auth-json beta "$TEST_ROOT/beta.json" --slot 2 >"$TEST_ROOT/import-beta.out"
assert_contains "$TEST_ROOT/import-beta.out" '^imported=beta'

node "$SWITCHER" list >"$TEST_ROOT/list.out"
assert_contains "$TEST_ROOT/list.out" 'alpha'
assert_contains "$TEST_ROOT/list.out" 'beta'

cp "$CODEX_HOME/auth.json" "$TEST_ROOT/auth.before-switch-dry.json"
node "$SWITCHER" switch --dry-run 2 >"$TEST_ROOT/switch-dry.out"
assert_contains "$TEST_ROOT/switch-dry.out" '^would_switch=beta'
cmp -s "$CODEX_HOME/auth.json" "$TEST_ROOT/auth.before-switch-dry.json" || fail "switch --dry-run changed auth"

node "$SWITCHER" switch 2 >"$TEST_ROOT/switch-beta.out"
assert_contains "$TEST_ROOT/switch-beta.out" '^switched=beta'
node "$SWITCHER" current >"$TEST_ROOT/current.out"
assert_contains "$TEST_ROOT/current.out" '^active=beta'

cp "$CODEX_HOME/auth.json" "$TEST_ROOT/auth.before-login-slot-dry.json"
node "$SWITCHER" login-slot --dry-run gamma >"$TEST_ROOT/login-slot-dry.out"
assert_contains "$TEST_ROOT/login-slot-dry.out" '^would_prepare_login_slot=gamma'
cmp -s "$CODEX_HOME/auth.json" "$TEST_ROOT/auth.before-login-slot-dry.json" || fail "login-slot --dry-run changed auth"

node "$SWITCHER" rollback --dry-run latest >"$TEST_ROOT/rollback-dry.out"
assert_contains "$TEST_ROOT/rollback-dry.out" '^would_rollback=ok'
cmp -s "$CODEX_HOME/auth.json" "$TEST_ROOT/auth.before-login-slot-dry.json" || fail "rollback --dry-run changed auth"

node "$SWITCHER" login-slot gamma >"$TEST_ROOT/login-slot.out"
assert_contains "$TEST_ROOT/login-slot.out" '^prepared_login_slot=gamma'
[[ ! -f "$CODEX_HOME/auth.json" ]] || fail "login-slot did not clear auth"

node "$SWITCHER" rollback latest >"$TEST_ROOT/rollback.out"
assert_contains "$TEST_ROOT/rollback.out" '^rollback=ok'
[[ -f "$CODEX_HOME/auth.json" ]] || fail "rollback did not restore auth"

node "$SWITCHER" doctor >"$TEST_ROOT/doctor.out"
assert_contains "$TEST_ROOT/doctor.out" '^doctor=ok'

if /usr/bin/grep -R 'test\.alpha\.access\|test\.beta\.refresh' "$TEST_ROOT"/*.out >/dev/null; then
  fail "command output leaked token-like fixture values"
fi

printf 'portable codex-account-switcher tests: PASS\n'
