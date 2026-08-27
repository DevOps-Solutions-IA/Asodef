#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --shared-dir DIR --api-image IMAGE --web-image IMAGE [--apply]" >&2
  exit 64
}

shared_dir='' api_image='' web_image='' apply=false
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
[[ "$api_image" =~ ^asodef-public-platform-api:[0-9a-f]{40}$ ]] || {
  echo 'status=error code=API_IMAGE_NOT_IMMUTABLE_RELEASE' >&2; exit 1;
}
[[ "$web_image" =~ ^asodef-public-platform-web:[0-9a-f]{40}$ ]] || {
  echo 'status=error code=WEB_IMAGE_NOT_IMMUTABLE_RELEASE' >&2; exit 1;
}
api_release_sha=${api_image##*:}
web_release_sha=${web_image##*:}
[[ "$api_release_sha" == "$web_release_sha" ]] || {
  echo 'status=error code=RELEASE_IMAGE_SHA_MISMATCH' >&2; exit 1;
}
[[ -d "$shared_dir" && ! -L "$shared_dir" ]] || {
  echo 'status=error code=SHARED_DIR_UNAVAILABLE' >&2; exit 1;
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/../.." && pwd)
base="$shared_dir/docker-compose.production.yml"
master="$shared_dir/docker-compose.master-tunnel.yml"
stack_env="$shared_dir/.stack.env"
app_env="$shared_dir/.env.production"
for path in "$base" "$master" "$stack_env" "$app_env"; do
  [[ -f "$path" && ! -L "$path" ]] || {
    echo 'status=error code=BASE_CONTRACT_UNAVAILABLE' >&2; exit 1;
  }
done
# Production secrets must never be writable by group/other. Owner writability
# is expected because this is the official protected production env source.
mode=$(stat -c '%a' "$stack_env")
(( (8#$mode & 0022) == 0 )) || { echo 'status=error code=STACK_ENV_PERMISSIONS_UNSAFE' >&2; exit 1; }
app_mode=$(stat -c '%a' "$app_env")
[[ "$app_mode" == 600 ]] || { echo 'status=error code=APPLICATION_ENV_PERMISSIONS_UNSAFE' >&2; exit 1; }

stage=$(mktemp -d "$shared_dir/.compose-contract-stage.XXXXXX")
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT
install -m 0644 "$repo_root/ops/mail-platform/docker-compose.mail-platform.yml" "$stage/docker-compose.mail-platform.yml"
install -m 0644 "$repo_root/ops/admin-core/docker-compose.admin-core.yml" "$stage/docker-compose.admin-core.yml"
python3 - "$script_dir/docker-compose.release.yml.template" "$stage/docker-compose.release.yml" "$api_image" "$web_image" "$app_env" <<'PY'
from pathlib import Path
import sys

source, target, api_image, web_image, app_env = sys.argv[1:]
text = Path(source).read_text(encoding="utf-8")
text = text.replace("@@API_IMAGE@@", api_image).replace("@@WEB_IMAGE@@", web_image).replace("@@APP_ENV_FILE@@", app_env)
if "@@" in text:
    raise SystemExit("unresolved release image placeholder")
Path(target).write_text(text, encoding="utf-8")
PY
chmod 0644 "$stage/docker-compose.release.yml"

compose_args=(
  --project-name asodef-public-platform-production
  --env-file "$stack_env"
  --file "$base"
  --file "$master"
  --file "$stage/docker-compose.mail-platform.yml"
  --file "$stage/docker-compose.admin-core.yml"
  --file "$stage/docker-compose.release.yml"
)
docker compose "${compose_args[@]}" config --quiet || {
  echo 'status=error code=MERGED_COMPOSE_INVALID' >&2; exit 1;
}

if [[ "$apply" != true ]]; then
  echo 'status=ready apply=false compose=valid overlays=mail,admin,release'
  exit 0
fi

docker image inspect "$api_image" "$web_image" >/dev/null 2>&1 || {
  echo 'status=error code=RELEASE_IMAGE_UNAVAILABLE' >&2; exit 1;
}
for image in "$api_image" "$web_image"; do
  revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
  case "$revision" in
    ''|'<no value>') ;;
    "$api_release_sha") ;;
    *) echo 'status=error code=RELEASE_IMAGE_REVISION_MISMATCH' >&2; exit 1 ;;
  esac
done

backup_root="$shared_dir/.compose-contract-backups"
[[ ! -e "$backup_root" || ( -d "$backup_root" && ! -L "$backup_root" ) ]] || {
  echo 'status=error code=COMPOSE_BACKUP_ROOT_UNSAFE' >&2; exit 1;
}
mkdir -p "$backup_root"
chmod 0700 "$backup_root"
backup_dir="$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -m 0700 "$backup_dir"
for name in docker-compose.mail-platform.yml docker-compose.admin-core.yml docker-compose.release.yml; do
  if [[ -e "$shared_dir/$name" ]]; then
    [[ -f "$shared_dir/$name" && ! -L "$shared_dir/$name" ]] || {
      echo 'status=error code=MANAGED_COMPOSE_PATH_UNSAFE' >&2; exit 1;
    }
    cp -p "$shared_dir/$name" "$backup_dir/$name"
  else
    : >"$backup_dir/$name.absent"
  fi
done

for name in docker-compose.mail-platform.yml docker-compose.admin-core.yml docker-compose.release.yml; do
  install -m 0644 "$stage/$name" "$shared_dir/$name.new"
  mv "$shared_dir/$name.new" "$shared_dir/$name"
done
printf '%s\n' "$backup_dir" >"$shared_dir/.compose-contract-last-backup.new"
chmod 0600 "$shared_dir/.compose-contract-last-backup.new"
mv "$shared_dir/.compose-contract-last-backup.new" "$shared_dir/.compose-contract-last-backup"

# Reload the canonical files and validate the installed state, not staging.
# shellcheck source=ops/production/compose-contract.sh
source "$script_dir/compose-contract.sh"
load_production_compose_contract "$shared_dir"
production_compose config --quiet
echo 'status=ok composeContract=INSTALLED services=api,web mailOverlay=PERSISTENT'
