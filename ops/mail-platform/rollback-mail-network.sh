#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || die usage_network_rollback_config_apply
load_config "$1"
MODE=${2:---dry-run}

members=$(docker network inspect "$MAIL_NETWORK_NAME" --format '{{len .Containers}}' 2>/dev/null || echo 0)
[ "$members" -eq 0 ] || die detach_public_api_before_network_rollback
if [ "$MODE" = "--dry-run" ]; then
  echo 'REQUIRES_OPERATOR_APPROVAL'
  echo "docker network rm $MAIL_NETWORK_NAME"
  exit 0
fi
[ "$MODE" = "--apply" ] || die invalid_mode
require_root
require_secure_config "$1"
require_approval
docker network rm "$MAIL_NETWORK_NAME" >/dev/null
echo 'status=rolled_back network=removed'
