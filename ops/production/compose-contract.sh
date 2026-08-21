#!/usr/bin/env bash

# Shared production Compose contract. Source this file from versioned entrypoints;
# it intentionally does not execute Docker by itself.
set -euo pipefail

ASODEF_PRODUCTION_PROJECT=asodef-public-platform-production

load_production_compose_contract() {
  local shared_dir=$1
  [[ -d "$shared_dir" && ! -L "$shared_dir" ]] || {
    echo 'status=error code=SHARED_DIR_UNAVAILABLE' >&2
    return 1
  }

  ASODEF_STACK_ENV="$shared_dir/.stack.env"
  ASODEF_BASE_COMPOSE="$shared_dir/docker-compose.production.yml"
  ASODEF_MASTER_COMPOSE="$shared_dir/docker-compose.master-tunnel.yml"
  ASODEF_MAIL_COMPOSE="$shared_dir/docker-compose.mail-platform.yml"
  ASODEF_ADMIN_COMPOSE="$shared_dir/docker-compose.admin-core.yml"
  ASODEF_RELEASE_COMPOSE="$shared_dir/docker-compose.release.yml"

  local path
  for path in \
    "$ASODEF_STACK_ENV" \
    "$ASODEF_BASE_COMPOSE" \
    "$ASODEF_MASTER_COMPOSE" \
    "$ASODEF_MAIL_COMPOSE" \
    "$ASODEF_ADMIN_COMPOSE" \
    "$ASODEF_RELEASE_COMPOSE"; do
    [[ -f "$path" && ! -L "$path" ]] || {
      echo 'status=error code=COMPOSE_CONTRACT_FILE_UNAVAILABLE' >&2
      return 1
    }
  done

  ASODEF_COMPOSE_ARGS=(
    --project-name "$ASODEF_PRODUCTION_PROJECT"
    --env-file "$ASODEF_STACK_ENV"
    --file "$ASODEF_BASE_COMPOSE"
    --file "$ASODEF_MASTER_COMPOSE"
    --file "$ASODEF_MAIL_COMPOSE"
    --file "$ASODEF_ADMIN_COMPOSE"
    --file "$ASODEF_RELEASE_COMPOSE"
  )
}

production_compose() {
  docker compose "${ASODEF_COMPOSE_ARGS[@]}" "$@"
}
