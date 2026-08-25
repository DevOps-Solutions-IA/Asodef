#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/docker-compose.local-preview.yml"
readonly STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}/asodef-local-preview-${UID}"
readonly ENV_FILE="$STATE_DIR/runtime.env"
readonly PURPOSE_LABEL=local-preview

fail() {
  printf 'Local Preview stop failed: %s\n' "$1" >&2
  exit 1
}

if [ ! -e "$ENV_FILE" ]; then
  printf 'No Local Preview runtime environment exists; nothing to stop.\n'
  exit 0
fi
[ -f "$ENV_FILE" ] || fail "runtime.env must be a regular file"
[ ! -L "$ENV_FILE" ] || fail "runtime.env must not be a symlink"
[ "$(stat -c %u "$ENV_FILE")" = "$(id -u)" ] || fail "runtime.env must belong to the current user"
[ "$(stat -c %a "$ENV_FILE")" = 600 ] || fail "runtime.env must have mode 0600"

project_name="$(awk -F= '$1 == "COMPOSE_PROJECT_NAME" { print substr($0, index($0, "=") + 1); exit }' "$ENV_FILE")"
[[ "$project_name" =~ ^asodef-preview-[0-9a-f]{12}-[0-9]+$ ]] || fail "runtime.env has an invalid Local Preview project name"

compose() {
  docker compose --project-name "$project_name" --env-file "$ENV_FILE" --file "$COMPOSE_FILE" "$@"
}

container_ids="$(compose ps --all --quiet 2>/dev/null || true)"
if [ -z "$container_ids" ]; then
  printf 'No Local Preview containers exist; runtime.env was preserved.\n'
  exit 0
fi

while IFS= read -r container_id; do
  [ -n "$container_id" ] || continue
  actual_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_id")"
  actual_purpose="$(docker inspect --format '{{ index .Config.Labels "com.asodef.purpose" }}' "$container_id")"
  [ "$actual_project" = "$project_name" ] || fail "refusing to stop a container from another project"
  [ "$actual_purpose" = "$PURPOSE_LABEL" ] || fail "refusing to stop a container without the Local Preview purpose label"
done <<<"$container_ids"

compose down --volumes --remove-orphans
printf 'Local Preview containers and volumes removed; runtime.env was preserved at %s.\n' "$ENV_FILE"
