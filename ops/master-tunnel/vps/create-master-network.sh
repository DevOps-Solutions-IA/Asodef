#!/usr/bin/env sh
set -eu

NETWORK_NAME="asodef_master_tunnel"
BRIDGE_NAME="asodef-master0"
SUBNET="172.25.51.0/29"
GATEWAY="172.25.51.1"

if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  actual_subnet="$(docker network inspect "$NETWORK_NAME" --format '{{(index .IPAM.Config 0).Subnet}}')"
  actual_gateway="$(docker network inspect "$NETWORK_NAME" --format '{{(index .IPAM.Config 0).Gateway}}')"
  actual_bridge="$(docker network inspect "$NETWORK_NAME" --format '{{index .Options "com.docker.network.bridge.name"}}')"
  actual_internal="$(docker network inspect "$NETWORK_NAME" --format '{{.Internal}}')"

  if [ "$actual_subnet" != "$SUBNET" ] || [ "$actual_gateway" != "$GATEWAY" ] || \
    [ "$actual_bridge" != "$BRIDGE_NAME" ] || [ "$actual_internal" != "true" ]; then
    echo "Existing network does not match the approved master-tunnel contract." >&2
    exit 1
  fi

  echo "Master tunnel network already matches the approved contract."
  exit 0
fi

if [ "${1:-}" != "--apply" ]; then
  echo "Dry run only. Re-run with --apply after the operator approves network creation."
  echo "docker network create --internal --driver bridge --subnet $SUBNET --gateway $GATEWAY --opt com.docker.network.bridge.name=$BRIDGE_NAME $NETWORK_NAME"
  exit 0
fi

docker network create \
  --internal \
  --driver bridge \
  --subnet "$SUBNET" \
  --gateway "$GATEWAY" \
  --opt "com.docker.network.bridge.name=$BRIDGE_NAME" \
  "$NETWORK_NAME" >/dev/null

echo "Created $NETWORK_NAME with a stable bridge, subnet and gateway."
