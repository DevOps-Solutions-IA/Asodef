#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --project NAME --compose FILE [--compose FILE] --api-image IMAGE --web-image IMAGE --apply" >&2
  exit 64
}

project="" api_image="" web_image="" apply=false
compose_files=()
while (($#)); do
  case "$1" in
    --project) project=${2:-}; shift 2 ;;
    --compose) compose_files+=("${2:-}"); shift 2 ;;
    --api-image) api_image=${2:-}; shift 2 ;;
    --web-image) web_image=${2:-}; shift 2 ;;
    --apply) apply=true; shift ;;
    *) usage ;;
  esac
done
[[ "$project" == "asodef-public-platform-production" ]] || { echo 'status=error code=PROJECT_NOT_ALLOWED' >&2; exit 1; }
[[ ${#compose_files[@]} -ge 1 && -n "$api_image" && -n "$web_image" ]] || usage
for file in "${compose_files[@]}"; do [[ -f "$file" ]] || { echo 'status=error code=COMPOSE_FILE_UNAVAILABLE' >&2; exit 1; }; done
docker image inspect "$api_image" >/dev/null 2>&1 && docker image inspect "$web_image" >/dev/null 2>&1 || {
  echo 'status=error code=ROLLBACK_IMAGE_UNAVAILABLE' >&2; exit 1;
}

compose_args=(--project-name "$project")
for file in "${compose_files[@]}"; do compose_args+=(--file "$file"); done
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
compose_args+=(--file "$script_dir/docker-compose.rollback.yml")
ROLLBACK_API_IMAGE="$api_image" ROLLBACK_WEB_IMAGE="$web_image" \
  docker compose "${compose_args[@]}" config --quiet || {
    echo 'status=error code=ROLLBACK_COMPOSE_INVALID' >&2; exit 1;
  }
[[ "$apply" == true ]] || { echo 'status=ready apply=false compose=valid scope=api,web protectedStackTouched=false'; exit 0; }

ROLLBACK_API_IMAGE="$api_image" ROLLBACK_WEB_IMAGE="$web_image" \
  docker compose "${compose_args[@]}" up -d --no-deps --force-recreate api web
echo 'status=ok rollback=APPLIED scope=api,web protectedStackTouched=false'
