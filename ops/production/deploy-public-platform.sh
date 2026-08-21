#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --shared-dir DIR --source-sha SHA --api-image IMAGE --api-image-id ID --web-image IMAGE --web-image-id ID [--apply]" >&2
  exit 64
}

shared_dir='' source_sha='' api_image='' api_image_id='' web_image='' web_image_id='' apply=false
while (($#)); do
  case "$1" in
    --shared-dir) shared_dir=${2:-}; shift 2 ;;
    --source-sha) source_sha=${2:-}; shift 2 ;;
    --api-image) api_image=${2:-}; shift 2 ;;
    --api-image-id) api_image_id=${2:-}; shift 2 ;;
    --web-image) web_image=${2:-}; shift 2 ;;
    --web-image-id) web_image_id=${2:-}; shift 2 ;;
    --apply) apply=true; shift ;;
    *) usage ;;
  esac
done
[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]] || usage
[[ "$api_image" == "asodef-public-platform-api:$source_sha" && "$web_image" == "asodef-public-platform-web:$source_sha" ]] || usage
[[ "$api_image_id" =~ ^sha256:[0-9a-f]{64}$ && "$web_image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || usage

verify_image() {
  local image=$1 expected_id=$2 actual
  actual=$(docker image inspect --format '{{.Id}}|{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
  [[ "$actual" == "$expected_id|$source_sha" ]] || {
    echo 'status=error code=DEPLOY_IMAGE_PROVENANCE_MISMATCH' >&2
    exit 1
  }
}
verify_image "$api_image" "$api_image_id"
verify_image "$web_image" "$web_image_id"

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
install_args=(--shared-dir "$shared_dir" --api-image "$api_image" --web-image "$web_image")
[[ "$apply" == true ]] && install_args+=(--apply)
"$script_dir/install-compose-contract.sh" "${install_args[@]}"
[[ "$apply" == true ]] || { echo 'status=ready deploy=false scope=api,web'; exit 0; }

# shellcheck source=ops/production/compose-contract.sh
source "$script_dir/compose-contract.sh"
load_production_compose_contract "$shared_dir"
production_compose up -d --no-deps --force-recreate api web

api_container=asodef-public-platform-production-api-1
web_container=asodef-public-platform-production-web-1
expected_files="$ASODEF_BASE_COMPOSE,$ASODEF_MASTER_COMPOSE,$ASODEF_MAIL_COMPOSE,$ASODEF_ADMIN_COMPOSE,$ASODEF_RELEASE_COMPOSE"
actual_files=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$api_container")
actual_env=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.environment_file"}}' "$api_container")
[[ "$actual_files" == "$expected_files" ]] || {
  echo 'status=error code=EFFECTIVE_COMPOSE_CONTRACT_MISMATCH' >&2; exit 1;
}
[[ "$actual_env" == "$ASODEF_STACK_ENV" ]] || {
  echo 'status=error code=EFFECTIVE_ENV_FILE_MISMATCH' >&2; exit 1;
}

network_name=asodef_mail_submission
[[ "$(docker network inspect "$network_name" --format '{{(index .IPAM.Config 0).Subnet}}')" == '172.25.52.0/29' ]] &&
  [[ "$(docker network inspect "$network_name" --format '{{(index .IPAM.Config 0).Gateway}}')" == '172.25.52.1' ]] &&
  [[ "$(docker network inspect "$network_name" --format '{{index .Options "com.docker.network.bridge.name"}}')" == 'asodef-mail0' ]] &&
  [[ "$(docker network inspect "$network_name" --format '{{.Internal}}')" == 'true' ]] || {
    echo 'status=error code=MAIL_NETWORK_CONTRACT_MISMATCH' >&2; exit 1;
  }
members=$(docker network inspect "$network_name" --format '{{range .Containers}}{{.Name}}={{.IPv4Address}}{{println}}{{end}}')
if [[ "$(printf '%s\n' "$members" | sed '/^$/d' | wc -l)" -ne 1 ]] ||
   ! printf '%s\n' "$members" | grep -Fx "$api_container=172.25.52.2/29" >/dev/null; then
    echo 'status=error code=MAIL_NETWORK_MEMBERSHIP_MISMATCH' >&2; exit 1;
fi

for _ in $(seq 1 30); do
  api_health=$(docker inspect --format '{{.State.Health.Status}}' "$api_container" 2>/dev/null || true)
  web_health=$(docker inspect --format '{{.State.Health.Status}}' "$web_container" 2>/dev/null || true)
  [[ "$api_health" == healthy && "$web_health" == healthy ]] && break
  [[ "$api_health" != unhealthy && "$web_health" != unhealthy ]] || {
    echo 'status=error code=DEPLOYED_SERVICE_UNHEALTHY' >&2; exit 1;
  }
  sleep 2
done
[[ "$api_health" == healthy && "$web_health" == healthy ]] || {
  echo 'status=error code=DEPLOYED_SERVICE_HEALTH_TIMEOUT' >&2; exit 1;
}
production_compose ps api web >/dev/null
echo 'status=ok deploy=APPLIED scope=api,web composeContract=base,master,mail,admin,release mailAddress=172.25.52.2 health=PASS'
