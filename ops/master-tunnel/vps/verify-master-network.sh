#!/usr/bin/env sh
set -eu

NETWORK_NAME="asodef_master_tunnel"
BRIDGE_NAME="asodef-master0"
SUBNET="172.25.51.0/29"
GATEWAY="172.25.51.1"
API_ADDRESS="172.25.51.2"
PORT="33051"
API_CONTAINER="${API_CONTAINER:-asodef-public-platform-production-api-1}"

fail() {
  echo "status=error check=$1" >&2
  exit 1
}

[ "$(docker network inspect "$NETWORK_NAME" --format '{{(index .IPAM.Config 0).Subnet}}' 2>/dev/null)" = "$SUBNET" ] || fail network_subnet
[ "$(docker network inspect "$NETWORK_NAME" --format '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null)" = "$GATEWAY" ] || fail network_gateway
[ "$(docker network inspect "$NETWORK_NAME" --format '{{index .Options "com.docker.network.bridge.name"}}' 2>/dev/null)" = "$BRIDGE_NAME" ] || fail bridge_name
[ "$(docker network inspect "$NETWORK_NAME" --format '{{.Internal}}' 2>/dev/null)" = "true" ] || fail network_internal

container_address="$(docker inspect "$API_CONTAINER" --format '{{(index .NetworkSettings.Networks "asodef_master_tunnel").IPAddress}}' 2>/dev/null)"
[ "$container_address" = "$API_ADDRESS" ] || fail api_address

ss -lnt | awk -v endpoint="$GATEWAY:$PORT" '$4 == endpoint { found=1 } END { exit !found }' || fail listener
ss -lnt | awk -v port=":$PORT" '$4 ~ "^(0.0.0.0|\\[::\\])" port "$" { found=1 } END { exit found }' || fail public_listener

docker port "$API_CONTAINER" | grep -E '(^|:)3051|(^|:)33051' >/dev/null 2>&1 && fail docker_publication

docker exec "$API_CONTAINER" node -e '
  const net = require("node:net");
  const socket = net.createConnection({ host: "172.25.51.1", port: 33051, timeout: 3000 });
  socket.once("connect", () => { console.log("apiToTunnel=ok"); socket.destroy(); });
  socket.once("timeout", () => { console.error("apiToTunnel=timeout"); socket.destroy(); process.exitCode = 1; });
  socket.once("error", () => { console.error("apiToTunnel=unavailable"); process.exitCode = 1; });
'

echo "status=ok network=$NETWORK_NAME apiAddress=$API_ADDRESS listener=$GATEWAY:$PORT"
