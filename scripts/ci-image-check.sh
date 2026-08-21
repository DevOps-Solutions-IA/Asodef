#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly suffix="${GITHUB_RUN_ID:-local}-$$"
readonly api_image="asodef-api-ci:${suffix}"
readonly web_image="asodef-web-ci:${suffix}"
cd "$repository_root"

cleanup() {
  docker image rm --force "$api_image" "$web_image" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker build --file apps/api/Dockerfile --tag "$api_image" .
docker run --rm --entrypoint sh "$api_image" -ec '
  test "$PWD" = /app/apps/api
  test -f prisma/schema.prisma
  test "$(node -p "require(\"./package.json\").scripts[\"prisma:deploy\"]")" = "prisma migrate deploy"
  test -x node_modules/.bin/prisma
  node_modules/.bin/prisma --version >/dev/null
  test ! -e /app/.env
  test ! -e /app/apps/web/.env.local
  node -e "const [major,minor]=process.versions.node.split(\".\").map(Number); process.exit(major>20 || (major===20 && minor>=19) ? 0 : 1)"
  if find /app -type f \( -name ".env" -o -name ".env.*" \) -print -quit | grep -q .; then
    echo "runtime environment file found in API image" >&2
    exit 1
  fi
  if grep -RIlE --exclude="*.map" -- "-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----" /app 2>/dev/null | grep -q .; then
    echo "private-key marker found in API image" >&2
    exit 1
  fi
'

docker build \
  --file apps/web/Dockerfile \
  --build-arg VITE_API_URL="http://127.0.0.1:3100" \
  --build-arg VITE_APP_URL="http://127.0.0.1:4173" \
  --tag "$web_image" .
docker run --rm --entrypoint sh "$web_image" -ec '
  if grep -RIlE -- "-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----" /usr/share/nginx/html 2>/dev/null | grep -q .; then
    echo "private-key marker found in web image" >&2
    exit 1
  fi
'

printf 'CI image check passed.\n'
