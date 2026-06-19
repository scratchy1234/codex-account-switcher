#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAILURES=0

report_files() {
  local label="$1"
  local pattern="$2"
  local matches

  matches="$(
    git grep -I -l -E "$pattern" -- \
      . \
      ':(exclude)scripts/check-public-safety.sh' 2>/dev/null || true
  )"

  if [[ -n "$matches" ]]; then
    printf 'FAIL: %s\n%s\n' "$label" "$matches" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

report_files \
  "tracked files contain an absolute user-home path" \
  '(/Users|/home)/[^/[:space:]]+/'

report_files \
  "tracked files contain a personal-looking email address" \
  '[[:alnum:]._%+-]+@(gmail|outlook|hotmail|icloud|qq|163)\.[[:alpha:]]{2,}'

report_files \
  "tracked files contain a credential-like value" \
  '(github_pat_[[:alnum:]_]{20,}|ghp_[[:alnum:]]{20,}|sk-[[:alnum:]]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|Authorization:[[:space:]]*Bearer[[:space:]]+[[:alnum:]_.-]{12,})'

if [[ "${1:-}" == "--history" ]]; then
  NON_NOREPLY=0
  while IFS= read -r email; do
    [[ -z "$email" ]] && continue
    case "$email" in
      *@users.noreply.github.com) ;;
      *) NON_NOREPLY=$((NON_NOREPLY + 1)) ;;
    esac
  done < <(git log --all --format='%ae%n%ce' | sort -u)

  if (( NON_NOREPLY > 0 )); then
    printf 'FAIL: git history contains %d non-noreply author/committer email(s)\n' "$NON_NOREPLY" >&2
    FAILURES=$((FAILURES + 1))
  fi
fi

if (( FAILURES > 0 )); then
  exit 1
fi

printf 'public safety check: PASS\n'

