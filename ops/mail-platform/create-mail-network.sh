#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || die usage_network_config_apply
load_config "$1"
MODE=${2:---dry-run}
require_command docker
require_command ip
require_command python3

if docker network inspect "$MAIL_NETWORK_NAME" >/dev/null 2>&1; then
  actual_subnet=$(docker network inspect "$MAIL_NETWORK_NAME" --format '{{(index .IPAM.Config 0).Subnet}}')
  actual_gateway=$(docker network inspect "$MAIL_NETWORK_NAME" --format '{{(index .IPAM.Config 0).Gateway}}')
  actual_bridge=$(docker network inspect "$MAIL_NETWORK_NAME" --format '{{index .Options "com.docker.network.bridge.name"}}')
  actual_internal=$(docker network inspect "$MAIL_NETWORK_NAME" --format '{{.Internal}}')
  [ "$actual_subnet" = "$MAIL_SUBNET" ] && [ "$actual_gateway" = "$MAIL_GATEWAY" ] && \
    [ "$actual_bridge" = "$MAIL_BRIDGE_NAME" ] && [ "$actual_internal" = true ] || die existing_network_contract_mismatch
  echo 'status=ok network=already_matches'
  exit 0
fi

mail_network_ids=$(docker network ls -q)
if [ -n "$mail_network_ids" ]; then
  # shellcheck disable=SC2086
  docker network inspect $mail_network_ids | python3 "$SCRIPT_DIR/check-network-overlap.py" --subnet "$MAIL_SUBNET" --source docker
fi
ip -j route show | python3 "$SCRIPT_DIR/check-network-overlap.py" --subnet "$MAIL_SUBNET" --source route

if [ "$MODE" = "--dry-run" ]; then
  echo 'REQUIRES_OPERATOR_APPROVAL'
  echo "docker network create --internal --driver bridge --subnet $MAIL_SUBNET --gateway $MAIL_GATEWAY --opt com.docker.network.bridge.name=$MAIL_BRIDGE_NAME $MAIL_NETWORK_NAME"
  exit 0
fi
[ "$MODE" = "--apply" ] || die invalid_mode
require_root
require_secure_config "$1"
require_approval
docker network create --internal --driver bridge --subnet "$MAIL_SUBNET" --gateway "$MAIL_GATEWAY" \
  --opt "com.docker.network.bridge.name=$MAIL_BRIDGE_NAME" "$MAIL_NETWORK_NAME" >/dev/null
echo 'status=created network=mail_submission'
