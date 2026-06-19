#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF="${1:-HEAD}"
OUT_DIR="${2:-$ROOT/dist}"
ARCHIVE_NAME="codex-account-switcher-skill.tgz"
ARCHIVE="$OUT_DIR/$ARCHIVE_NAME"
CHECKSUM="$ARCHIVE.sha256"
TMP_TAR="$(mktemp)"

cleanup() {
  rm -f "$TMP_TAR"
}
trap cleanup EXIT

GIT_ROOT="$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ "$GIT_ROOT" != "$ROOT" ]]; then
  printf 'FAIL: release builds require a standalone Git clone at %s\n' "$ROOT" >&2
  exit 1
fi

git -C "$ROOT" rev-parse --verify "$REF^{commit}" >/dev/null
"$ROOT/scripts/run-tests.sh"
"$ROOT/scripts/check-public-safety.sh" --history

mkdir -p "$OUT_DIR"
git -C "$ROOT" archive \
  --format=tar \
  --prefix=codex-account-switcher/ \
  "$REF" >"$TMP_TAR"
gzip -n -c "$TMP_TAR" >"$ARCHIVE"

(
  cd "$OUT_DIR"
  shasum -a 256 "$ARCHIVE_NAME" >"$(basename "$CHECKSUM")"
)

if tar -tzf "$ARCHIVE" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  printf 'FAIL: release archive contains an unsafe path\n' >&2
  exit 1
fi

OWNER_GROUPS="$(
  tar -tvf "$ARCHIVE" |
    awk '{
      if ($2 ~ /^[0-9]+$/) {
        print $3 "/" $4
      } else {
        print $2
      }
    }' |
    sort -u
)"
if [[ "$OWNER_GROUPS" != "root/root" && "$OWNER_GROUPS" != "0/0" ]]; then
  printf 'FAIL: release archive contains non-normalized owner metadata\n' >&2
  printf '%s\n' "$OWNER_GROUPS" >&2
  exit 1
fi

printf 'release_archive=%s\n' "$ARCHIVE"
printf 'release_checksum=%s\n' "$CHECKSUM"
