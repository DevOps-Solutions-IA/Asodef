#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --shared-dir DIR --api-image IMAGE --web-image IMAGE [--apply]" >&2
  exit 64
}

shared_dir="" api_image="" web_image="" apply=false
while (($#)); do
  case "$1" in
    --shared-dir) shared_dir=${2:-}; shift 2 ;;
    --api-image) api_image=${2:-}; shift 2 ;;
    --web-image) web_image=${2:-}; shift 2 ;;
    --apply) apply=true; shift ;;
    *) usage ;;
  esac
done
[[ -n "$shared_dir" && -n "$api_image" && -n "$web_image" ]] || usage
if ! docker image inspect "$api_image" >/dev/null 2>&1 || \
   ! docker image inspect "$web_image" >/dev/null 2>&1; then
  echo 'status=error code=ROLLBACK_IMAGE_UNAVAILABLE' >&2; exit 1;
fi

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=ops/production/compose-contract.sh
source "$script_dir/../production/compose-contract.sh"
load_production_compose_contract "$shared_dir"
ASODEF_COMPOSE_ARGS+=(--file "$script_dir/docker-compose.rollback.yml")
ROLLBACK_API_IMAGE="$api_image" ROLLBACK_WEB_IMAGE="$web_image" \
  production_compose config --quiet || {
    echo 'status=error code=ROLLBACK_COMPOSE_INVALID' >&2; exit 1;
  }
[[ "$apply" == true ]] || { echo 'status=ready apply=false compose=valid scope=api,web protectedStackTouched=false'; exit 0; }

ROLLBACK_API_IMAGE="$api_image" ROLLBACK_WEB_IMAGE="$web_image" \
  production_compose up -d --no-deps --force-recreate api web
echo 'status=ok rollback=APPLIED scope=api,web mailAttachment=preserved protectedStackTouched=false'
