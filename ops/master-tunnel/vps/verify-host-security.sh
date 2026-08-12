#!/usr/bin/env sh
set -eu

BRIDGE_NAME="asodef-master0"
PUBLIC_INTERFACE="eth0"
API_ADDRESS="172.25.51.2"
GATEWAY="172.25.51.1"
TUNNEL_PORT="33051"
FIREBIRD_PORT="3051"
NETWORK_NAME="asodef_master_tunnel"

echo "listener_audit"

sudo ss -lntp | awk 'NR == 1 || /:(3051|33051)[[:space:]]/'

if sudo ss -lnt | awk '$4 ~ /^(0.0.0.0|\[::\]):(3051|33051)$/ { found=1 } END { exit !found }'; then
  echo "status=error check=public_listener" >&2
  exit 1
fi

if ! sudo ss -lnt |
  grep -Fq "${GATEWAY}:${TUNNEL_PORT}"; then
  echo "status=error check=private_listener_missing" >&2
  exit 1
fi

echo "firewall_audit"

sudo ufw status numbered

ufw_rules="$(sudo iptables -S ufw-user-input)"

private_rule="$(
  printf '%s\n' "$ufw_rules" |
  grep -- "-j ACCEPT" |
  grep -- "-i ${BRIDGE_NAME}" |
  grep -- "-s ${API_ADDRESS}/32" |
  grep -- "-d ${GATEWAY}/32" |
  grep -- "--dport ${TUNNEL_PORT}" ||
  true
)"

if [ -z "$private_rule" ]; then
  echo "status=error check=private_firewall_allow_missing" >&2
  exit 1
fi

public_firebird_deny="$(
  printf '%s\n' "$ufw_rules" |
  grep -- "-j DROP" |
  grep -- "-i ${PUBLIC_INTERFACE}" |
  grep -- "--dport ${FIREBIRD_PORT}" ||
  true
)"

if [ -z "$public_firebird_deny" ]; then
  echo "status=error check=public_firebird_deny_missing" >&2
  exit 1
fi

public_tunnel_deny="$(
  printf '%s\n' "$ufw_rules" |
  grep -- "-j DROP" |
  grep -- "-i ${PUBLIC_INTERFACE}" |
  grep -- "--dport ${TUNNEL_PORT}" ||
  true
)"

if [ -z "$public_tunnel_deny" ]; then
  echo "status=error check=public_tunnel_deny_missing" >&2
  exit 1
fi

sudo nft list ruleset |
  grep -E -C 4 '3051|33051|asodef-master0|172.25.51.' ||
  true

echo "sshd_effective_policy"

sudo sshd -T \
  -C user=asodef-tunnel,host="$(hostname)",addr=10.8.1.234 |
grep -E '^(authenticationmethods|pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication|allowtcpforwarding|gatewayports|permitlisten|permitopen|permittty|x11forwarding|allowagentforwarding|permittunnel|forcecommand)'

echo "docker_master_network"

network_members="$(
  docker network inspect "$NETWORK_NAME" \
    --format '{{range $id,$c := .Containers}}{{$c.Name}}={{$c.IPv4Address}}{{println}}{{end}}'
)"

printf '%s\n' "$network_members"

member_count="$(
  printf '%s\n' "$network_members" |
  sed '/^[[:space:]]*$/d' |
  wc -l |
  tr -d ' '
)"

if [ "$member_count" != "1" ]; then
  echo "status=error check=master_network_member_count" >&2
  exit 1
fi

if ! printf '%s\n' "$network_members" |
  grep -Eq '^asodef-public-platform-production-api-1=172\.25\.51\.2/29$'; then
  echo "status=error check=master_network_api_identity" >&2
  exit 1
fi

echo "docker_publication_audit"

docker ps --format '{{.Names}} {{.Ports}}' |
grep -E '(^|[^0-9])(3051|33051)([^0-9]|$)' && {
  echo "status=error check=docker_publication" >&2
  exit 1
} || true

echo "status=ok"
