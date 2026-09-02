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
SSHD_DROPIN="${SSHD_DROPIN:-/etc/ssh/sshd_config.d/60-asodef-legacy-bridge-v2.conf}"
PUBLIC_INTERFACE="${PUBLIC_INTERFACE:-}"
PUBLIC_KEY_FILE=""
APPLY=0

fail() {
  printf '{"status":"error","check":"%s"}\n' "$1" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --public-key-file) [ "$#" -ge 2 ] || fail public_key_argument; PUBLIC_KEY_FILE="$2"; shift 2 ;;
    --public-interface) [ "$#" -ge 2 ] || fail public_interface_argument; PUBLIC_INTERFACE="$2"; shift 2 ;;
    *) fail unknown_argument ;;
  esac
done

[ -n "$PUBLIC_KEY_FILE" ] || fail public_key_file_required
[ -f "$PUBLIC_KEY_FILE" ] || fail public_key_file_missing

for command in docker ip awk grep getent sshd ufw; do
  command -v "$command" >/dev/null 2>&1 || fail "missing_$command"
done

if [ -z "$PUBLIC_INTERFACE" ]; then
  PUBLIC_INTERFACE="$(ip route show default 2>/dev/null | awk 'NR==1 {for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
fi
[ -n "$PUBLIC_INTERFACE" ] || fail public_interface_unresolved

PUBLIC_KEY="$(tr -d '\r\n' < "$PUBLIC_KEY_FILE")"
case "$PUBLIC_KEY" in
  ssh-ed25519\ *) ;;
  *) fail public_key_not_ed25519 ;;
esac

if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  [ "$(docker network inspect "$NETWORK_NAME" --format '{{(index .IPAM.Config 0).Subnet}}')" = "$SUBNET" ] || fail network_subnet_mismatch
  [ "$(docker network inspect "$NETWORK_NAME" --format '{{(index .IPAM.Config 0).Gateway}}')" = "$GATEWAY" ] || fail network_gateway_mismatch
  [ "$(docker network inspect "$NETWORK_NAME" --format '{{index .Options "com.docker.network.bridge.name"}}')" = "$BRIDGE_NAME" ] || fail network_bridge_mismatch
  [ "$(docker network inspect "$NETWORK_NAME" --format '{{.Internal}}')" = "true" ] || fail network_not_internal
fi

if [ "$APPLY" -ne 1 ]; then
  printf '{"status":"dry-run","network":"%s","gateway":"%s","listenerPort":%s,"publicInterface":"%s","mutationsApplied":false}\n' \
    "$NETWORK_NAME" "$GATEWAY" "$TUNNEL_PORT" "$PUBLIC_INTERFACE"
  exit 0
fi

sudo -v >/dev/null

if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  docker network create \
    --internal \
    --driver bridge \
    --subnet "$SUBNET" \
    --gateway "$GATEWAY" \
    --opt "com.docker.network.bridge.name=$BRIDGE_NAME" \
    "$NETWORK_NAME" >/dev/null
fi

if ! getent passwd "$TUNNEL_USER" >/dev/null; then
  sudo useradd --system --create-home --user-group --shell /usr/sbin/nologin "$TUNNEL_USER"
else
  sudo usermod --shell /usr/sbin/nologin "$TUNNEL_USER"
fi

HOME_DIR="$(getent passwd "$TUNNEL_USER" | awk -F: '{print $6}')"
[ -n "$HOME_DIR" ] || fail tunnel_user_home_missing
sudo install -d -m 0700 -o "$TUNNEL_USER" -g "$TUNNEL_USER" "$HOME_DIR/.ssh"
AUTH_KEYS="$HOME_DIR/.ssh/authorized_keys"
sudo touch "$AUTH_KEYS"
sudo chown "$TUNNEL_USER:$TUNNEL_USER" "$AUTH_KEYS"
sudo chmod 0600 "$AUTH_KEYS"

AUTHORIZED_LINE="restrict,port-forwarding,permitlisten=\"$GATEWAY:$TUNNEL_PORT\" $PUBLIC_KEY"
if ! sudo grep -Fqx "$AUTHORIZED_LINE" "$AUTH_KEYS"; then
  printf '%s\n' "$AUTHORIZED_LINE" | sudo tee -a "$AUTH_KEYS" >/dev/null
fi

TMP_DROPIN="$(mktemp)"
trap 'rm -f "$TMP_DROPIN"' EXIT
cat > "$TMP_DROPIN" <<EOF
Match User $TUNNEL_USER
    AuthenticationMethods publickey
    PubkeyAuthentication yes
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    AllowTcpForwarding remote
    GatewayPorts clientspecified
    PermitListen $GATEWAY:$TUNNEL_PORT
    PermitOpen none
    PermitTTY no
    X11Forwarding no
    AllowAgentForwarding no
    PermitTunnel no
EOF
sudo install -d -m 0755 "$(dirname "$SSHD_DROPIN")"
if sudo test -f "$SSHD_DROPIN"; then
  sudo cp -a "$SSHD_DROPIN" "$SSHD_DROPIN.bak"
fi
sudo install -m 0600 -o root -g root "$TMP_DROPIN" "$SSHD_DROPIN"
sudo sshd -t || fail sshd_syntax
EFFECTIVE="$(sudo sshd -T -C "user=$TUNNEL_USER,host=$(hostname),addr=127.0.0.1")"
printf '%s\n' "$EFFECTIVE" | grep -Eq '^allowtcpforwarding remote$' || fail sshd_forwarding_policy
printf '%s\n' "$EFFECTIVE" | grep -Eq '^gatewayports clientspecified$' || fail sshd_gatewayports_policy
printf '%s\n' "$EFFECTIVE" | grep -Fq "permitlisten $GATEWAY:$TUNNEL_PORT" || fail sshd_permitlisten_policy
printf '%s\n' "$EFFECTIVE" | grep -Eq '^passwordauthentication no$' || fail sshd_password_policy
printf '%s\n' "$EFFECTIVE" | grep -Eq '^kbdinteractiveauthentication no$' || fail sshd_kbd_policy

if systemctl list-unit-files sshd.service >/dev/null 2>&1; then
  sudo systemctl reload sshd
elif systemctl list-unit-files ssh.service >/dev/null 2>&1; then
  sudo systemctl reload ssh
else
  fail ssh_service_unresolved
fi

sudo ufw status | grep -Fq 'Status: active' || fail ufw_inactive

UFW_STATUS="$(sudo ufw status)"
if ! printf '%s\n' "$UFW_STATUS" | grep -Fq "$GATEWAY $TUNNEL_PORT/tcp" || ! printf '%s\n' "$UFW_STATUS" | grep -Fq "$API_ADDRESS"; then
  sudo ufw allow in on "$BRIDGE_NAME" from "$API_ADDRESS" to "$GATEWAY" port "$TUNNEL_PORT" proto tcp comment 'ASODEF API to Legacy Bridge V2'
fi
UFW_STATUS="$(sudo ufw status)"
if ! printf '%s\n' "$UFW_STATUS" | grep -Fq 'DENY public Firebird master'; then
  sudo ufw deny in on "$PUBLIC_INTERFACE" to any port "$FIREBIRD_PORT" proto tcp comment 'DENY public Firebird master'
fi
UFW_STATUS="$(sudo ufw status)"
if ! printf '%s\n' "$UFW_STATUS" | grep -Fq 'DENY public ASODEF Legacy Bridge V2'; then
  sudo ufw deny in on "$PUBLIC_INTERFACE" to any port "$TUNNEL_PORT" proto tcp comment 'DENY public ASODEF Legacy Bridge V2'
fi

printf '{"status":"ok","network":"%s","gateway":"%s","listenerPort":%s,"tunnelUser":"%s","publicInterface":"%s","mutationsApplied":true}\n' \
  "$NETWORK_NAME" "$GATEWAY" "$TUNNEL_PORT" "$TUNNEL_USER" "$PUBLIC_INTERFACE"
