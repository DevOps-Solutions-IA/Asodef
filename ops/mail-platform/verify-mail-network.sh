#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib.sh"

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || die usage_verify_mail_network
load_config "$1"
MODE=${2:---full}
[ "$MODE" = "--full" ] || [ "$MODE" = "--attachment-only" ] || die invalid_mode
require_command docker

actual_subnet=$(docker network inspect "$MAIL_NETWORK_NAME" --format '{{(index .IPAM.Config 0).Subnet}}')
actual_gateway=$(docker network inspect "$MAIL_NETWORK_NAME" --format '{{(index .IPAM.Config 0).Gateway}}')
actual_bridge=$(docker network inspect "$MAIL_NETWORK_NAME" --format '{{index .Options "com.docker.network.bridge.name"}}')
actual_internal=$(docker network inspect "$MAIL_NETWORK_NAME" --format '{{.Internal}}')
[ "$actual_subnet" = "$MAIL_SUBNET" ] && [ "$actual_gateway" = "$MAIL_GATEWAY" ] && \
  [ "$actual_bridge" = "$MAIL_BRIDGE_NAME" ] && [ "$actual_internal" = true ] || die network_contract_mismatch

members=$(docker network inspect "$MAIL_NETWORK_NAME" --format '{{range .Containers}}{{.Name}}={{.IPv4Address}}{{println}}{{end}}')
[ "$(printf '%s\n' "$members" | sed '/^$/d' | wc -l)" -eq 1 ] || die unexpected_network_member_count
printf '%s\n' "$members" | grep -Fx "$MAIL_API_CONTAINER=$MAIL_API_ADDRESS/29" >/dev/null || die api_network_identity_mismatch
if [ "$MODE" = "--attachment-only" ]; then
  echo 'status=ok network=dedicated member=public_api phase=attachment_only'
  exit 0
fi
require_command ss
ss -lnt | awk '{print $4}' | grep -Fx "$MAIL_LISTEN_ADDRESS:587" >/dev/null || die private_submission_listener_missing
ss -lnt | awk '{print $4}' | grep -Eq '^(0\.0\.0\.0|\[::\]|\*):587$' && die public_submission_listener_exposed
ss -lnt | awk '{print $4}' | grep -Fx "$MAIL_PUBLIC_IPV4:587" >/dev/null && die public_submission_listener_exposed
echo 'status=ok network=dedicated member=public_api listener=private'
