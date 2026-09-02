#!/usr/bin/env bash
set -euo pipefail

TUNNEL_USER="${TUNNEL_USER:-asodef-tunnel}"
NETWORK_NAME="${NETWORK_NAME:-asodef_master_tunnel}"
BRIDGE_NAME="${BRIDGE_NAME:-asodef-master0}"
SUBNET="${SUBNET:-172.25.51.0/29}"
GATEWAY="${GATEWAY:-172.25.51.1}"
API_ADDRESS="${API_ADDRESS:-172.25.51.2}"
TUNNEL_PORT="${TUNNEL_PORT:-33051}"
FIREBIRD_PORT="${FIREBIRD_PORT:-3051}"
API_CONTAINER="${API_CONTAINER:-asodef-public-platform-production-api-1}"
PUBLIC_KEY_FILE=""
RUN_E2E=0

fail() {
  printf '{"status":"error","check":"%s"}\n' "$1" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --public-key-file) [ "$#" -ge 2 ] || fail public_key_argument; PUBLIC_KEY_FILE="$2"; shift 2 ;;
    --e2e) RUN_E2E=1; shift ;;
    *) fail unknown_argument ;;
  esac
done

for command in docker awk grep getent ss sshd; do
  command -v "$command" >/dev/null 2>&1 || fail "missing_$command"
done

[ "$(docker network inspect "$NETWORK_NAME" --format '{{(index .IPAM.Config 0).Subnet}}' 2>/dev/null)" = "$SUBNET" ] || fail network_subnet
[ "$(docker network inspect "$NETWORK_NAME" --format '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null)" = "$GATEWAY" ] || fail network_gateway
[ "$(docker network inspect "$NETWORK_NAME" --format '{{index .Options "com.docker.network.bridge.name"}}' 2>/dev/null)" = "$BRIDGE_NAME" ] || fail network_bridge
[ "$(docker network inspect "$NETWORK_NAME" --format '{{.Internal}}' 2>/dev/null)" = "true" ] || fail network_internal

getent passwd "$TUNNEL_USER" >/dev/null || fail tunnel_user_missing
[ "$(getent passwd "$TUNNEL_USER" | awk -F: '{print $7}')" = "/usr/sbin/nologin" ] || fail tunnel_user_shell
HOME_DIR="$(getent passwd "$TUNNEL_USER" | awk -F: '{print $6}')"
AUTH_KEYS="$HOME_DIR/.ssh/authorized_keys"
sudo test -f "$AUTH_KEYS" || fail authorized_keys_missing
sudo grep -Fq "restrict,port-forwarding,permitlisten=\"$GATEWAY:$TUNNEL_PORT\"" "$AUTH_KEYS" || fail authorized_key_restriction

if [ -n "$PUBLIC_KEY_FILE" ]; then
  [ -f "$PUBLIC_KEY_FILE" ] || fail public_key_file_missing
  PUBLIC_KEY="$(tr -d '\r\n' < "$PUBLIC_KEY_FILE")"
  sudo grep -Fq "$PUBLIC_KEY" "$AUTH_KEYS" || fail authorized_key_identity
fi

EFFECTIVE="$(sudo sshd -T -C "user=$TUNNEL_USER,host=$(hostname),addr=127.0.0.1")"
printf '%s\n' "$EFFECTIVE" | grep -Eq '^authenticationmethods publickey$' || fail sshd_authentication
printf '%s\n' "$EFFECTIVE" | grep -Eq '^allowtcpforwarding remote$' || fail sshd_forwarding
printf '%s\n' "$EFFECTIVE" | grep -Eq '^gatewayports clientspecified$' || fail sshd_gatewayports
printf '%s\n' "$EFFECTIVE" | grep -Fq "permitlisten $GATEWAY:$TUNNEL_PORT" || fail sshd_permitlisten
printf '%s\n' "$EFFECTIVE" | grep -Eq '^permitopen none$' || fail sshd_permitopen
printf '%s\n' "$EFFECTIVE" | grep -Eq '^passwordauthentication no$' || fail sshd_password

ss -lnt | awk -v endpoint="$GATEWAY:$TUNNEL_PORT" '$4 == endpoint {found=1} END {exit !found}' || fail private_listener
if ss -lnt | awk -v p=":$TUNNEL_PORT" '$4 ~ "^(0.0.0.0|\\[::\\])" p "$" {found=1} END {exit !found}'; then
  fail wildcard_listener
fi
if ss -lnt | awk -v p=":$FIREBIRD_PORT" '$4 ~ "^(0.0.0.0|\\[::\\])" p "$" {found=1} END {exit !found}'; then
  fail public_firebird_listener
fi

API_IP="$(docker inspect "$API_CONTAINER" --format '{{(index .NetworkSettings.Networks "asodef_master_tunnel").IPAddress}}' 2>/dev/null)"
[ "$API_IP" = "$API_ADDRESS" ] || fail api_address
MEMBERS="$(docker network inspect "$NETWORK_NAME" --format '{{range $id,$c := .Containers}}{{$c.Name}}{{println}}{{end}}' | sed '/^[[:space:]]*$/d')"
[ "$(printf '%s\n' "$MEMBERS" | wc -l | tr -d ' ')" = "1" ] || fail network_member_count
[ "$MEMBERS" = "$API_CONTAINER" ] || fail network_member_identity

docker port "$API_CONTAINER" | grep -E '(^|:)(3051|33051)(/|$)' >/dev/null 2>&1 && fail docker_publication

docker exec "$API_CONTAINER" node -e '
const net=require("node:net");
const s=net.createConnection({host:"172.25.51.1",port:33051,timeout:3000});
s.once("connect",()=>{s.destroy();process.exit(0)});
s.once("timeout",()=>{s.destroy();process.exit(2)});
s.once("error",()=>process.exit(3));
' >/dev/null 2>&1 || fail api_to_tunnel

if [ "$RUN_E2E" -eq 1 ]; then
  E2E="$(docker exec "$API_CONTAINER" pnpm --silent master:verify-readonly 2>/dev/null)" || fail e2e_command
  printf '%s' "$E2E" | grep -Fq '"status":"ok"' || fail e2e_status
  printf '%s' "$E2E" | grep -Fq '"currentUser":"ASODEF_READONLY"' || fail e2e_identity
  printf '%s' "$E2E" | grep -Fq '"healthValue":1' || fail e2e_health
fi

printf '{"status":"ok","network":"%s","apiAddress":"%s","listener":"%s:%s","tunnelUser":"%s","e2e":%s}\n' \
  "$NETWORK_NAME" "$API_ADDRESS" "$GATEWAY" "$TUNNEL_PORT" "$TUNNEL_USER" "$([ "$RUN_E2E" -eq 1 ] && printf true || printf false)"
