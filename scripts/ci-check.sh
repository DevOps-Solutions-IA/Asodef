#!/usr/bin/env bash

set -Eeuo pipefail

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly cache_dir="$(mktemp -d /tmp/asodef-turbo-ci.XXXXXX)"
cd "$repository_root"

cleanup() {
  rm -rf -- "$cache_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Source analysis and tests share one graph and test environment. The
# production build is deliberately separate: carrying NODE_ENV=test into a
# Vite build can select development/test library branches even though `vite
# build` itself completes successfully. Both phases share only this run's
# private cache, never the developer cache.
NODE_ENV=test pnpm exec turbo run lint typecheck test \
  --cache-dir "$cache_dir" \
  --concurrency=2

NODE_ENV=production pnpm exec turbo run build \
  --cache-dir "$cache_dir" \
  --concurrency=2
