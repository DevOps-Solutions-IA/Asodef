#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

fail() {
  printf 'CI security check failed: %s\n' "$1" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail "git is unavailable"
command -v pnpm >/dev/null 2>&1 || fail "pnpm is unavailable"

# A real runtime environment file or private key must never become a tracked
# artifact. Sanitized `.env.example` files remain allowed documentation.
while IFS= read -r tracked_file; do
  case "$tracked_file" in
    .env.example|*/.env.example) ;;
    .env|.env.*|*/.env|*/.env.*) fail "a runtime environment file is tracked" ;;
  esac
done < <(git ls-files)

if git grep -nE -- '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----' -- ':!pnpm-lock.yaml' >/dev/null; then
  fail "a private-key marker is present in tracked source"
fi

if git grep -nE -- '(describe|it|test)\.(skip|only)\(|(^|[^[:alnum:]_])(xdescribe|xit)\(' \
  -- 'apps/**' 'e2e/**' >/dev/null; then
  fail "a skipped or exclusive test is present"
fi

for required_pattern in '.env' '.env.*' '**/.env' '**/.env.*'; do
  grep -Fx -- "$required_pattern" .dockerignore >/dev/null || fail ".dockerignore lacks runtime env exclusion"
done

git diff --check

# Moderate advisories are still printed and reviewed in release evidence;
# high/critical production dependency findings are hard blockers.
pnpm audit --prod --audit-level=high

printf 'CI security check passed.\n'
