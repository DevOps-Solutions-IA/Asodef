#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --shared-dir DIR --api-image IMAGE --api-image-id ID --web-image IMAGE --web-image-id ID [--apply]" >&2
  exit 64
}

shared_dir='' api_image='' api_image_id='' web_image='' web_image_id='' apply=false
while (($#)); do
  case "$1" in
    --shared-dir) shared_dir=${2:-}; shift 2 ;;
    --api-image) api_image=${2:-}; shift 2 ;;
    --api-image-id) api_image_id=${2:-}; shift 2 ;;
    --web-image) web_image=${2:-}; shift 2 ;;
    --web-image-id) web_image_id=${2:-}; shift 2 ;;
    --apply) apply=true; shift ;;
    *) usage ;;
  esac
done
[[ -n "$shared_dir" && -n "$api_image" && -n "$web_image" ]] || usage
[[ "$api_image_id" =~ ^sha256:[0-9a-f]{64}$ && "$web_image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || usage
[[ -d "$shared_dir" && ! -L "$shared_dir" ]] || {
  echo 'status=error code=SHARED_DIR_UNAVAILABLE' >&2; exit 1;
}

pointer="$shared_dir/.compose-contract-last-backup"
[[ -f "$pointer" && ! -L "$pointer" ]] || {
  echo 'status=error code=COMPOSE_BACKUP_POINTER_UNAVAILABLE' >&2; exit 1;
}
backup_dir=$(<"$pointer")
case "$backup_dir" in
  "$shared_dir"/.compose-contract-backups/*) ;;
  *) echo 'status=error code=COMPOSE_BACKUP_POINTER_INVALID' >&2; exit 1 ;;
esac
[[ -d "$backup_dir" && ! -L "$backup_dir" ]] || {
  echo 'status=error code=COMPOSE_BACKUP_UNAVAILABLE' >&2; exit 1;
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
rollback_overlay="$script_dir/../admin-core/docker-compose.rollback.yml"
stack_env="$shared_dir/.stack.env"
base="$shared_dir/docker-compose.production.yml"
master="$shared_dir/docker-compose.master-tunnel.yml"
for path in "$stack_env" "$base" "$master" "$rollback_overlay"; do
  [[ -f "$path" && ! -L "$path" ]] || {
    echo 'status=error code=ROLLBACK_CONTRACT_FILE_UNAVAILABLE' >&2; exit 1;
  }
done
[[ "$(docker image inspect --format '{{.Id}}' "$api_image")" == "$api_image_id" ]] &&
  [[ "$(docker image inspect --format '{{.Id}}' "$web_image")" == "$web_image_id" ]] || {
    echo 'status=error code=ROLLBACK_IMAGE_PROVENANCE_MISMATCH' >&2; exit 1;
  }

managed=(docker-compose.mail-platform.yml docker-compose.admin-core.yml docker-compose.release.yml)
compose_args=(
  --project-name asodef-public-platform-production
  --env-file "$stack_env"
  --file "$base"
  --file "$master"
)
for name in "${managed[@]}"; do
  if [[ -f "$backup_dir/$name" && ! -L "$backup_dir/$name" ]]; then
    compose_args+=(--file "$backup_dir/$name")
  elif [[ ! -f "$backup_dir/$name.absent" ]]; then
    echo 'status=error code=COMPOSE_BACKUP_INCOMPLETE' >&2
    exit 1
  fi
done
compose_args+=(--file "$rollback_overlay")
ROLLBACK_API_IMAGE="$api_image" ROLLBACK_WEB_IMAGE="$web_image" \
  docker compose "${compose_args[@]}" config --quiet || {
    echo 'status=error code=ROLLBACK_COMPOSE_INVALID' >&2; exit 1;
  }
[[ "$apply" == true ]] || {
  echo 'status=ready apply=false composeContractRollback=valid scope=api,web'; exit 0;
}

# Restore the prior declarative files before recreating containers so future
# Compose operations see the same contract represented by this rollback.
for name in "${managed[@]}"; do
  if [[ -f "$backup_dir/$name" ]]; then
    install -m 0644 "$backup_dir/$name" "$shared_dir/$name.new"
    mv "$shared_dir/$name.new" "$shared_dir/$name"
  else
    [[ -f "$backup_dir/$name.absent" ]] || {
      echo 'status=error code=COMPOSE_BACKUP_INCOMPLETE' >&2; exit 1;
    }
    [[ ! -e "$shared_dir/$name" || ( -f "$shared_dir/$name" && ! -L "$shared_dir/$name" ) ]] || {
      echo 'status=error code=MANAGED_COMPOSE_PATH_UNSAFE' >&2; exit 1;
    }
    [[ ! -e "$shared_dir/$name" ]] || unlink "$shared_dir/$name"
  fi
done

compose_args=(
  --project-name asodef-public-platform-production
  --env-file "$stack_env"
  --file "$base"
  --file "$master"
)
for name in "${managed[@]}"; do
  [[ -f "$shared_dir/$name" ]] && compose_args+=(--file "$shared_dir/$name")
done
compose_args+=(--file "$rollback_overlay")
ROLLBACK_API_IMAGE="$api_image" ROLLBACK_WEB_IMAGE="$web_image" \
  docker compose "${compose_args[@]}" config --quiet
ROLLBACK_API_IMAGE="$api_image" ROLLBACK_WEB_IMAGE="$web_image" \
  docker compose "${compose_args[@]}" up -d --no-deps --force-recreate api web
mv "$pointer" "$pointer.used.$(date -u +%Y%m%dT%H%M%SZ)"
echo 'status=ok composeContractRollback=APPLIED scope=api,web externalNetworksRemoved=false'
