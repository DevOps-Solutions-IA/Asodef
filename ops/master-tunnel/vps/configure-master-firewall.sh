#!/usr/bin/env sh
set -eu

BRIDGE_NAME="asodef-master0"
PUBLIC_INTERFACE="eth0"
API_ADDRESS="172.25.51.2"
GATEWAY="172.25.51.1"
TUNNEL_PORT="33051"
FIREBIRD_PORT="3051"

PRIVATE_COMMENT="ASODEF API to Firebird SSH tunnel stable"
PUBLIC_FIREBIRD_COMMENT="DENY public Firebird master"
PUBLIC_TUNNEL_COMMENT="DENY public ASODEF master tunnel"

if [ "${1:-}" != "--apply" ]; then
  echo "Dry run only. The following privileged commands require operator approval:"
  echo
  echo "sudo ufw allow in on $BRIDGE_NAME from $API_ADDRESS to $GATEWAY port $TUNNEL_PORT proto tcp comment '$PRIVATE_COMMENT'"
  echo "sudo ufw deny in on $PUBLIC_INTERFACE to any port $FIREBIRD_PORT proto tcp comment '$PUBLIC_FIREBIRD_COMMENT'"
  echo "sudo ufw deny in on $PUBLIC_INTERFACE to any port $TUNNEL_PORT proto tcp comment '$PUBLIC_TUNNEL_COMMENT'"
  exit 0
fi

sudo ufw allow in on "$BRIDGE_NAME" \
  from "$API_ADDRESS" \
  to "$GATEWAY" \
  port "$TUNNEL_PORT" \
  proto tcp \
  comment "$PRIVATE_COMMENT"

sudo ufw deny in on "$PUBLIC_INTERFACE" \
  to any \
  port "$FIREBIRD_PORT" \
  proto tcp \
  comment "$PUBLIC_FIREBIRD_COMMENT"

sudo ufw deny in on "$PUBLIC_INTERFACE" \
  to any \
  port "$TUNNEL_PORT" \
  proto tcp \
  comment "$PUBLIC_TUNNEL_COMMENT"

sudo ufw status numbered
